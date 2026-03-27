import {
  Interaction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GuildMember,
  MessageFlags,
} from 'discord.js';
import { ProductCategory } from '../models/Product';
import * as ShopService from '../services/ShopService';
import * as HonorPoints from '../services/HonorPointsService';
import { logShopAction } from '../utils/botsLogger';

export const name = 'interactionCreate';
export const once = false;

export async function execute(interaction: Interaction): Promise<void> {
  if (interaction.isChatInputCommand()) {
    const client = interaction.client as any;
    const command = client.commands?.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[Command] Error in /${interaction.commandName}:`, error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'An error occurred while executing this command.', ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: 'An error occurred while executing this command.', ephemeral: true }).catch(() => {});
      }
    }
    return;
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'shop_role_select') {
      await handleRoleSelect(interaction);
    }
    return;
  }

  if (!interaction.isButton()) return;
  if (!interaction.guild || !interaction.member) return;

  const customId = interaction.customId;

  try {
    if (customId.startsWith('shop_cat_')) {
      await handleCategoryBrowse(interaction);
    } else if (customId.startsWith('shop_buy_')) {
      await handleBuyButton(interaction);
    } else if (customId.startsWith('shop_confirm_')) {
      await handleConfirmPurchase(interaction);
    } else if (customId === 'shop_cancel') {
      await handleCancel(interaction);
    } else if (customId === 'shop_balance') {
      await handleBalanceCheck(interaction);
    } else if (customId === 'shop_history' || customId.startsWith('shop_history_page_')) {
      await handlePurchaseHistory(interaction);
    } else if (customId === 'shop_back') {
      await handleBackToShop(interaction);
    }
  } catch (error) {
    console.error(`[Interaction] Error handling ${customId}:`, error);
    try {
      const content = 'Something went wrong. Please try again.';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      }
    } catch {}
  }
}

// ── Role Select (dropdown) ──

async function handleRoleSelect(interaction: any): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const productId = interaction.values?.[0];
  if (!productId || productId === 'no_roles') {
    await interaction.editReply({ content: 'No roles are currently available.' });
    return;
  }

  const product = await ShopService.getProductById(productId);
  if (!product || !product.active || product.category !== 'role') {
    await interaction.editReply({ content: 'This role is no longer available.' });
    return;
  }

  const balResult = await HonorPoints.getBalance(interaction.user.id);
  const balance = balResult.honorPoints;
  const canAfford = balance >= product.price;

  const embed = new EmbedBuilder()
    .setTitle('Confirm Purchase')
    .setDescription(
      `**${product.name}**\n${product.description || ''}\n\n` +
      `Price: **${product.price.toLocaleString()} HP**\n` +
      `Your Balance: **${balance.toLocaleString()} HP**\n` +
      `After Purchase: **${canAfford ? (balance - product.price).toLocaleString() : '—'} HP**`
    )
    .setColor(canAfford ? 0x10b981 : 0xef4444);

  if (product.imageUrl) {
    embed.setThumbnail(product.imageUrl);
  }

  if (!canAfford) {
    embed.addFields({
      name: 'Insufficient Balance',
      value: `You need **${(product.price - balance).toLocaleString()} more HP** to purchase this item.`,
    });
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`shop_confirm_${product.productId}`)
      .setLabel('Confirm Purchase')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canAfford),
    new ButtonBuilder()
      .setCustomId('shop_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger),
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

// ── Category Browse ──

async function handleCategoryBrowse(interaction: any): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const category = interaction.customId.replace('shop_cat_', '') as ProductCategory;
  const products = await ShopService.getProductsByCategory(category);
  const label = ShopService.getCategoryLabel(category);

  logShopAction({
    userId: interaction.user.id,
    username: interaction.user.username,
    category: 'shop',
    action: 'browse_category',
    details: { category, productsFound: products.length },
  });

  if (products.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle(`${label} — Empty`)
      .setDescription('No items are currently available in this category.')
      .setColor(0x6b7280);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('shop_back')
        .setLabel('Back to Shop')
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`${label}`)
    .setDescription(`${products.length} item${products.length !== 1 ? 's' : ''} available. Click **Buy** to purchase.`)
    .setColor(0x8b5cf6);

  for (const p of products) {
    const stockText = p.stock === -1 ? 'Unlimited' : `${p.stock} left`;
    embed.addFields({
      name: `${p.name} — ${p.price.toLocaleString()} HP`,
      value: `${p.description || 'No description'}\nStock: ${stockText}`,
      inline: false,
    });
  }

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const BUTTONS_PER_ROW = 5;

  for (let i = 0; i < products.length; i += BUTTONS_PER_ROW) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    const chunk = products.slice(i, i + BUTTONS_PER_ROW);
    for (const p of chunk) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`shop_buy_${p.productId}`)
          .setLabel(`Buy ${p.name}`)
          .setStyle(ButtonStyle.Success),
      );
    }
    rows.push(row);
  }

  // Back button
  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('shop_back')
      .setLabel('Back to Shop')
      .setStyle(ButtonStyle.Secondary),
  );
  rows.push(backRow);

  // Discord limits to 5 action rows
  await interaction.editReply({ embeds: [embed], components: rows.slice(0, 5) });
}

// ── Buy Button (show confirmation) ──

async function handleBuyButton(interaction: any): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const productId = interaction.customId.replace('shop_buy_', '');
  const product = await ShopService.getProductById(productId);

  if (!product || !product.active) {
    await interaction.editReply({ content: 'This product is no longer available.' });
    return;
  }

  const balResult = await HonorPoints.getBalance(interaction.user.id);
  const balance = balResult.honorPoints;
  const canAfford = balance >= product.price;

  const embed = new EmbedBuilder()
    .setTitle('Confirm Purchase')
    .setDescription(
      `**${product.name}**\n${product.description || ''}\n\n` +
      `Price: **${product.price.toLocaleString()} HP**\n` +
      `Your Balance: **${balance.toLocaleString()} HP**\n` +
      `After Purchase: **${canAfford ? (balance - product.price).toLocaleString() : '—'} HP**`
    )
    .setColor(canAfford ? 0x10b981 : 0xef4444);

  if (product.imageUrl) {
    embed.setThumbnail(product.imageUrl);
  }

  if (!canAfford) {
    embed.addFields({
      name: 'Insufficient Balance',
      value: `You need **${(product.price - balance).toLocaleString()} more HP** to purchase this item.`,
    });
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`shop_confirm_${product.productId}`)
      .setLabel('Confirm Purchase')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canAfford),
    new ButtonBuilder()
      .setCustomId('shop_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger),
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

// ── Confirm Purchase ──

async function handleConfirmPurchase(interaction: any): Promise<void> {
  await interaction.deferUpdate();

  const productId = interaction.customId.replace('shop_confirm_', '');
  const member = interaction.member as GuildMember;

  const result = await ShopService.purchaseProduct({
    userId: interaction.user.id,
    username: interaction.user.username,
    productId,
    member,
  });

  if (!result.success) {
    logShopAction({
      userId: interaction.user.id,
      username: interaction.user.username,
      category: 'purchase',
      action: 'purchase_failed',
      details: { productId, error: result.error },
    });

    const errorEmbed = new EmbedBuilder()
      .setTitle('Purchase Failed')
      .setDescription(result.error ?? 'Unknown error occurred.')
      .setColor(0xef4444);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('shop_back')
        .setLabel('Back to Shop')
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({ embeds: [errorEmbed], components: [row] });
    return;
  }

  const p = result.purchase!;
  const embed = new EmbedBuilder()
    .setTitle('Purchase Successful!')
    .setColor(0x10b981)
    .addFields(
      { name: 'Product', value: p.productName, inline: true },
      { name: 'Price', value: `${p.price.toLocaleString()} HP`, inline: true },
      { name: 'Remaining Balance', value: `${p.remainingBalance.toLocaleString()} HP`, inline: true },
      { name: 'Purchase ID', value: `\`${p.purchaseId}\``, inline: false },
    );

  if (p.roleAssigned) {
    embed.addFields({ name: 'Delivery', value: 'Role has been assigned to you!', inline: false });
  }

  if (p.deliveryContent) {
    embed.addFields({
      name: 'Your Code / Link',
      value: `||${p.deliveryContent}||`,
      inline: false,
    });
    embed.setFooter({ text: 'This code is shown only to you. Save it now!' });
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('shop_back')
      .setLabel('Back to Shop')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({ embeds: [embed], components: [row] });

  // Log to purchase channel (non-blocking)
  ShopService.logPurchaseToChannel(interaction.client, {
    purchaseId: p.purchaseId,
    userId: interaction.user.id,
    username: interaction.user.username,
    productName: p.productName,
    category: (await ShopService.getProductById(productId))?.category ?? 'unknown',
    price: p.price,
  });
}

// ── Cancel ──

async function handleCancel(interaction: any): Promise<void> {
  await interaction.deferUpdate();

  logShopAction({
    userId: interaction.user.id,
    username: interaction.user.username,
    category: 'purchase',
    action: 'purchase_cancelled',
  });

  const embed = new EmbedBuilder()
    .setTitle('Purchase Cancelled')
    .setDescription('No Honor Points were deducted.')
    .setColor(0x6b7280);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('shop_back')
      .setLabel('Back to Shop')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

// ── Balance Check ──

async function handleBalanceCheck(interaction: any): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await HonorPoints.getBalance(interaction.user.id);

  const testBadge = HonorPoints.isTestMode() ? '  `[TEST MODE]`' : '';
  const embed = new EmbedBuilder()
    .setTitle(`Honor Points Balance${testBadge}`)
    .setDescription(
      `**${result.honorPoints.toLocaleString()} HP**`
    )
    .setColor(0x8b5cf6)
    .setFooter({ text: `User: ${interaction.user.username}` })
    .setTimestamp();

  if (!result.success) {
    embed.addFields({ name: 'Warning', value: result.error ?? 'Could not fetch balance.' });
  }

  logShopAction({
    userId: interaction.user.id,
    username: interaction.user.username,
    category: 'balance',
    action: 'check_balance',
    details: { honorPoints: result.honorPoints },
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('shop_back')
      .setLabel('Back to Shop')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

// ── Purchase History ──

async function handlePurchaseHistory(interaction: any): Promise<void> {
  const isPageNav = interaction.customId.startsWith('shop_history_page_');

  if (isPageNav) {
    await interaction.deferUpdate();
  } else {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  let page = 0;
  if (isPageNav) {
    page = parseInt(interaction.customId.replace('shop_history_page_', ''), 10) || 0;
  }

  const { purchases, total, page: currentPage, totalPages } = await ShopService.getUserPurchases(
    interaction.user.id,
    page,
  );

  if (!isPageNav) {
    logShopAction({
      userId: interaction.user.id,
      username: interaction.user.username,
      category: 'shop',
      action: 'view_history',
      details: { totalPurchases: total },
    });
  }

  if (total === 0) {
    const embed = new EmbedBuilder()
      .setTitle('Purchase History')
      .setDescription('You have no purchases yet.')
      .setColor(0x6b7280);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('shop_back')
        .setLabel('Back to Shop')
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('Purchase History')
    .setDescription(`Showing ${purchases.length} of ${total} purchases (Page ${currentPage + 1}/${totalPages})`)
    .setColor(0x8b5cf6);

  for (const p of purchases) {
    const date = new Date(p.createdAt).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    const statusEmoji = p.status === 'completed' ? '✅' : p.status === 'refunded' ? '↩️' : '❌';
    embed.addFields({
      name: `${statusEmoji} ${p.productName} — ${p.price.toLocaleString()} HP`,
      value: `${date} · \`${p.purchaseId}\` · ${p.status}`,
      inline: false,
    });
  }

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`shop_history_page_${currentPage - 1}`)
      .setLabel('Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 0),
    new ButtonBuilder()
      .setCustomId(`shop_history_page_${currentPage + 1}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId('shop_back')
      .setLabel('Back to Shop')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({ embeds: [embed], components: [navRow] });
}

// ── Back to Shop (dismiss ephemeral) ──

async function handleBackToShop(interaction: any): Promise<void> {
  await interaction.deferUpdate();

  const embed = new EmbedBuilder()
    .setTitle('Honor Shop')
    .setDescription('Use the buttons in the shop channel to continue browsing.')
    .setColor(0x8b5cf6);

  await interaction.editReply({ embeds: [embed], components: [] });
}
