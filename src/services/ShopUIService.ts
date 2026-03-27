import {
  Client,
  TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
} from 'discord.js';
import { Product } from '../models/Product';
import { isTestMode } from './HonorPointsService';

const SHOP_CHANNEL_ID = process.env.SHOP_CHANNEL_ID ?? '';
const REFRESH_INTERVAL_MS = 3 * 60 * 1000;

let shopMessageId: string | null = null;
let refreshTimer: NodeJS.Timeout | null = null;

export function getShopMessageId(): string | null {
  return shopMessageId;
}

async function getProductCounts(): Promise<{ roles: number; steam: number; nitro: number }> {
  const [roles, steam, nitro] = await Promise.all([
    Product.countDocuments({ category: 'role', active: true, stock: { $ne: 0 } }),
    Product.countDocuments({ category: 'steam_gift_card', active: true, stock: { $ne: 0 } }),
    Product.countDocuments({ category: 'discord_nitro', active: true, stock: { $ne: 0 } }),
  ]);
  return { roles, steam, nitro };
}

function buildShopEmbed(counts: { roles: number; steam: number; nitro: number }): EmbedBuilder {
  const testBadge = isTestMode() ? '  `[TEST MODE]`' : '';

  return new EmbedBuilder()
    .setTitle(`Honor Shop${testBadge}`)
    .setDescription(
      'Welcome to the **Honor Shop**! Spend your Honor Points on exclusive rewards.\n\n' +
      'Browse categories below to see available items. All purchases are final unless refunded by an admin.\n\n' +
      `**Available Items**\n` +
      `> Roles — ${counts.roles} item${counts.roles !== 1 ? 's' : ''}\n` +
      `> Steam Gift Cards — ${counts.steam} item${counts.steam !== 1 ? 's' : ''}\n` +
      `> Discord Nitro — ${counts.nitro} item${counts.nitro !== 1 ? 's' : ''}`
    )
    .setColor(0x8b5cf6)
    .setFooter({ text: 'Use the buttons below to browse, check balance, or view history' })
    .setTimestamp();
}

function buildShopButtons(): ActionRowBuilder<ButtonBuilder>[] {
  const categoryRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('shop_cat_role')
      .setLabel('Roles')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('👑'),
    new ButtonBuilder()
      .setCustomId('shop_cat_steam_gift_card')
      .setLabel('Steam Gift Cards')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎮'),
    new ButtonBuilder()
      .setCustomId('shop_cat_discord_nitro')
      .setLabel('Discord Nitro')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('💎'),
  );

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

  return [categoryRow, utilityRow];
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
    const components = buildShopButtons();

    // Try to find our existing message
    if (shopMessageId) {
      try {
        const existing = await channel.messages.fetch(shopMessageId);
        await existing.edit({ embeds: [embed], components });
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
      await botMsg.edit({ embeds: [embed], components });
    } else {
      const sent = await channel.send({ embeds: [embed], components });
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
