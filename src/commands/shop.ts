import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { isTestMode } from '../services/HonorPointsService';

export const data = new SlashCommandBuilder()
  .setName('shop')
  .setDescription('View the Honor Shop information');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const channelId = process.env.SHOP_CHANNEL_ID;
  const testBadge = isTestMode() ? '  `[TEST MODE]`' : '';

  const embed = new EmbedBuilder()
    .setTitle(`Honor Shop${testBadge}`)
    .setDescription(
      'The Honor Shop lets you spend your Honor Points on exclusive rewards!\n\n' +
      '**Categories:**\n' +
      '> 👑 Roles — Exclusive server roles\n' +
      '> 🛡️ Access Perks — Priority channels, support, and permissions\n' +
      '> 💬 Community Perks — Community features and participation perks\n' +
      '> 🏆 Legend Rewards — High-tier spotlight and prestige rewards\n' +
      '\n' +
      (channelId
        ? `Head to <#${channelId}> to browse and purchase items!`
        : 'The shop channel has not been configured yet.')
    )
    .setColor(0x8b5cf6)
    .setFooter({ text: 'All purchases use Honor Points' });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
