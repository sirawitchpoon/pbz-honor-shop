import {
  GuildMember,
  EmbedBuilder,
  TextChannel,
  Client,
} from 'discord.js';
import { Product, IProduct, ProductCategory } from '../models/Product';
import { Purchase } from '../models/Purchase';
import * as HonorPoints from './HonorPointsService';
import { logShopAction } from '../utils/botsLogger';

function generatePurchaseId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PUR-${ts}-${rand}`;
}

const CATEGORY_LABELS: Record<ProductCategory, string> = {
  role: 'Roles',
  steam_gift_card: 'Steam Gift Cards',
  discord_nitro: 'Discord Nitro',
};

export function getCategoryLabel(cat: ProductCategory): string {
  return CATEGORY_LABELS[cat] ?? cat;
}

export async function getProductsByCategory(category: ProductCategory): Promise<IProduct[]> {
  return Product.find({ category, active: true, $or: [{ stock: { $ne: 0 } }, { stock: -1 }] })
    .sort({ price: 1 })
    .lean<IProduct[]>();
}

export async function getProductById(productId: string): Promise<IProduct | null> {
  return Product.findOne({ productId }).lean<IProduct | null>();
}

export interface PurchaseResult {
  success: boolean;
  error?: string;
  purchase?: {
    purchaseId: string;
    productName: string;
    price: number;
    remainingBalance: number;
    deliveryContent?: string;
    roleAssigned?: boolean;
  };
}

export async function purchaseProduct(params: {
  userId: string;
  username: string;
  productId: string;
  member: GuildMember;
}): Promise<PurchaseResult> {
  const product = await Product.findOne({ productId: params.productId, active: true }).lean<IProduct>();
  if (!product) {
    return { success: false, error: 'This product is no longer available.' };
  }

  if (product.stock === 0) {
    return { success: false, error: 'This product is out of stock.' };
  }

  // Role duplicate check
  if (product.category === 'role' && product.roleId) {
    if (params.member.roles.cache.has(product.roleId)) {
      return { success: false, error: 'You already have this role.' };
    }
  }

  // Deduct honor points
  const deductResult = await HonorPoints.deductPoints({
    userId: params.userId,
    amount: product.price,
    username: params.username,
  });

  if (!deductResult.success) {
    const balResult = await HonorPoints.getBalance(params.userId);
    const bal = balResult.honorPoints;
    if (deductResult.error === 'Insufficient balance') {
      return {
        success: false,
        error: `Insufficient Honor Points. You have **${bal.toLocaleString()} HP** but need **${product.price.toLocaleString()} HP**.`,
      };
    }
    return { success: false, error: deductResult.error ?? 'Failed to deduct Honor Points.' };
  }

  const purchaseId = generatePurchaseId();

  // Decrement stock (skip for unlimited stock = -1)
  if (product.stock > 0) {
    const updated = await Product.findOneAndUpdate(
      { productId: params.productId, active: true, stock: { $gt: 0 } },
      { $inc: { stock: -1 } },
      { new: true }
    );

    if (!updated) {
      // Refund — stock ran out between check and purchase
      await HonorPoints.addPoints({
        userId: params.userId,
        amount: product.price,
        username: params.username,
      });
      return { success: false, error: 'Product went out of stock. Your Honor Points have been refunded.' };
    }

    // Auto-deactivate single-use digital items when stock hits 0
    if (updated.stock === 0 && product.category !== 'role') {
      await Product.updateOne({ productId: params.productId }, { active: false });
    }
  }

  // Deliver the product
  let roleAssigned = false;
  let deliveredContent: string | undefined;

  if (product.category === 'role' && product.roleId) {
    try {
      await params.member.roles.add(product.roleId);
      roleAssigned = true;
    } catch (e) {
      // Refund on role assignment failure
      await HonorPoints.addPoints({
        userId: params.userId,
        amount: product.price,
        username: params.username,
      });
      if (product.stock > 0) {
        await Product.updateOne({ productId: params.productId }, { $inc: { stock: 1 } });
      }
      return { success: false, error: 'Failed to assign role. Your Honor Points have been refunded.' };
    }
  } else if (product.deliveryContent) {
    deliveredContent = product.deliveryContent;
  }

  // Record purchase
  await Purchase.create({
    purchaseId,
    userId: params.userId,
    username: params.username,
    productId: product.productId,
    productName: product.name,
    category: product.category,
    price: product.price,
    status: 'completed',
    deliveredContent: deliveredContent,
  });

  logShopAction({
    userId: params.userId,
    username: params.username,
    category: 'purchase',
    action: 'purchase_success',
    details: {
      purchaseId,
      productId: product.productId,
      productName: product.name,
      productCategory: product.category,
      price: product.price,
      remainingBalance: deductResult.honorPoints,
    },
  });

  return {
    success: true,
    purchase: {
      purchaseId,
      productName: product.name,
      price: product.price,
      remainingBalance: deductResult.honorPoints,
      deliveryContent: deliveredContent,
      roleAssigned,
    },
  };
}

export async function getUserPurchases(
  userId: string,
  page: number = 0,
  limit: number = 10
): Promise<{ purchases: any[]; total: number; page: number; totalPages: number }> {
  const total = await Purchase.countDocuments({ userId, status: { $ne: 'failed' } });
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));

  const purchases = await Purchase.find({ userId, status: { $ne: 'failed' } })
    .sort({ createdAt: -1 })
    .skip(safePage * limit)
    .limit(limit)
    .lean();

  return { purchases, total, page: safePage, totalPages };
}

export async function logPurchaseToChannel(client: Client, purchase: {
  purchaseId: string;
  userId: string;
  username: string;
  productName: string;
  category: string;
  price: number;
}): Promise<void> {
  const channelId = process.env.PURCHASE_LOG_CHANNEL_ID;
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) return;

    const embed = new EmbedBuilder()
      .setTitle('Purchase Completed')
      .setColor(0x10b981)
      .addFields(
        { name: 'Purchase ID', value: `\`${purchase.purchaseId}\``, inline: true },
        { name: 'User', value: `<@${purchase.userId}> (${purchase.username})`, inline: true },
        { name: 'Product', value: purchase.productName, inline: true },
        { name: 'Category', value: getCategoryLabel(purchase.category as ProductCategory), inline: true },
        { name: 'Price', value: `${purchase.price.toLocaleString()} HP`, inline: true },
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch {
    // Non-critical
  }
}
