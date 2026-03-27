import { Client, Events } from 'discord.js';
import { startShopUI } from '../services/ShopUIService';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client: Client): Promise<void> {
  console.log(`[Bot] Logged in as ${client.user?.tag}`);
  startShopUI(client);
}
