import {
  Client,
  TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  AttachmentBuilder,
} from 'discord.js';
import { Product } from '../models/Product';
import { isTestMode } from './HonorPointsService';
import { existsSync } from 'fs';
import path from 'path';

const SHOP_CHANNEL_ID = process.env.SHOP_CHANNEL_ID ?? '';
const REFRESH_INTERVAL_MS = 3 * 60 * 1000;
const SHOP_BANNER_PATH = path.join(process.cwd(), 'assets', 'shop-banner.png');

let shopMessageId: string | null = null;
let refreshTimer: NodeJS.Timeout | null = null;

export function getShopMessageId(): string | null {
  return shopMessageId;
}

async function getProductCounts(): Promise<{ roles: number }> {
  const roles = await Product.countDocuments({ category: 'role', active: true, stock: { $ne: 0 } });
  return { roles };
}

function buildShopEmbed(counts: { roles: number }): EmbedBuilder {
  const testBadge = isTestMode() ? '  `[TEST MODE]`' : '';

  return new EmbedBuilder()
    .setTitle(`Honor Shop${testBadge}`)
    .setDescription(
      'Welcome to the **Honor Shop**! Spend your Honor Points on exclusive rewards.\n\n' +
      'Browse categories below to see available items. All purchases are final unless refunded by an admin.\n\n' +
      `**Available Items**\n` +
      `> Roles — ${counts.roles} item${counts.roles !== 1 ? 's' : ''}`
    )
    .setColor(0x8b5cf6)
    .setFooter({ text: 'Use the dropdown to select roles, or use utility buttons below' })
    .setTimestamp();
}

async function buildRoleSelectRow(): Promise<ActionRowBuilder<StringSelectMenuBuilder>> {
  const products = await Product.find({ category: 'role', active: true, $or: [{ stock: { $ne: 0 } }, { stock: -1 }] })
    .sort({ price: 1 })
    .limit(25)
    .lean();

  const menu = new StringSelectMenuBuilder()
    .setCustomId('shop_role_select')
    .setPlaceholder(products.length > 0 ? 'Select a role to purchase' : 'No roles currently available')
    .setDisabled(products.length === 0);

  if (products.length === 0) {
    menu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('No roles available')
        .setDescription('Please check again later.')
        .setValue('no_roles')
        .setEmoji('⏳'),
    );
  } else {
    const options = products.map((p) => {
      const stockText = p.stock === -1 ? 'Unlimited' : `${p.stock} left`;
      return new StringSelectMenuOptionBuilder()
        .setLabel(`${p.name} — ${p.price.toLocaleString()} HP`.slice(0, 100))
        .setDescription(`${p.description || 'Role reward'} · ${stockText}`.slice(0, 100))
        .setValue(p.productId)
        .setEmoji('👑');
    });
    menu.addOptions(options);
  }

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function buildShopButtons(): ActionRowBuilder<ButtonBuilder> {
  const utilityRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('shop_balance')
      .setLabel('Check Balance')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('💰'),
    new ButtonBuilder()
      .setCustomId('shop_history')
      .setLabel('Purchase History')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📜'),
  );

  return utilityRow;
}

async function ensureShopMessage(client: Client): Promise<void> {
  if (!SHOP_CHANNEL_ID) {
    console.warn('[ShopUI] SHOP_CHANNEL_ID not set — skipping shop embed');
    return;
  }

  try {
    const channel = await client.channels.fetch(SHOP_CHANNEL_ID);
    if (!channel || !(channel instanceof TextChannel)) {
      console.error('[ShopUI] SHOP_CHANNEL_ID is not a valid text channel');
      return;
    }

    const counts = await getProductCounts();
    const embed = buildShopEmbed(counts);
    const roleSelectRow = await buildRoleSelectRow();
    const utilityRow = buildShopButtons();

    // Banner slot: place your image file at assets/shop-banner.png
    const files = [];
    if (existsSync(SHOP_BANNER_PATH)) {
      embed.setImage('attachment://shop-banner.png');
      files.push(new AttachmentBuilder(SHOP_BANNER_PATH, { name: 'shop-banner.png' }));
    } else {
      embed.addFields({
        name: 'Banner Image',
        value: 'Not configured yet. Put your image at `assets/shop-banner.png`.',
      });
    }
    const payload = files.length > 0
      ? { embeds: [embed], components: [roleSelectRow, utilityRow], files }
      : { embeds: [embed], components: [roleSelectRow, utilityRow] };

    // Try to find our existing message
    if (shopMessageId) {
      try {
        const existing = await channel.messages.fetch(shopMessageId);
        await existing.edit(payload);
        return;
      } catch {
        shopMessageId = null;
      }
    }

    // Look for a recent bot message to reuse
    const recent = await channel.messages.fetch({ limit: 20 });
    const botMsg = recent.find(
      (m: Message) => m.author.id === client.user?.id && m.embeds.length > 0
    );

    if (botMsg) {
      shopMessageId = botMsg.id;
      await botMsg.edit(payload);
    } else {
      const sent = await channel.send(payload);
      shopMessageId = sent.id;
    }

    console.log(`[ShopUI] Shop embed active in #${channel.name} (msg: ${shopMessageId})`);
  } catch (error) {
    console.error('[ShopUI] Failed to ensure shop message:', error);
  }
}

export function startShopUI(client: Client): void {
  ensureShopMessage(client);

  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    ensureShopMessage(client);
  }, REFRESH_INTERVAL_MS);
}

export function stopShopUI(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}
