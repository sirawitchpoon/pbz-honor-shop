import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { connectDB } from './utils/connectDB';
import { isHonorPointsConfigured, isTestMode } from './services/HonorPointsService';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

(client as any).commands = new Collection();

async function loadCommands(): Promise<void> {
  const commandsDir = path.join(__dirname, 'commands');
  if (!fs.existsSync(commandsDir)) return;

  const files = fs.readdirSync(commandsDir).filter((f) => f.endsWith('.ts') || f.endsWith('.js'));
  for (const file of files) {
    const mod = await import(path.join(commandsDir, file));
    if (mod.data && mod.execute) {
      (client as any).commands.set(mod.data.name, mod);
      console.log(`[Bot] Loaded command: ${mod.data.name}`);
    }
  }
}

async function loadEvents(): Promise<void> {
  const eventsDir = path.join(__dirname, 'events');
  if (!fs.existsSync(eventsDir)) return;

  const files = fs.readdirSync(eventsDir).filter((f) => f.endsWith('.ts') || f.endsWith('.js'));
  for (const file of files) {
    const mod = await import(path.join(eventsDir, file));
    if (mod.name && mod.execute) {
      if (mod.once) {
        client.once(mod.name, (...args: any[]) => mod.execute(...args));
      } else {
        client.on(mod.name, (...args: any[]) => mod.execute(...args));
      }
      console.log(`[Bot] Loaded event: ${mod.name} (once: ${!!mod.once})`);
    }
  }
}

async function start(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error('[Bot] DISCORD_TOKEN is not set');
    process.exit(1);
  }

  await connectDB();

  if (isTestMode()) {
    console.log('[Bot] TEST MODE — using in-memory Honor Points');
  } else if (isHonorPointsConfigured()) {
    console.log('[Bot] Honor Points API configured');
  } else {
    console.warn('[Bot] Honor Points API not configured — purchases will fail');
  }

  await loadCommands();
  await loadEvents();

  await client.login(token);
}

start().catch((err) => {
  console.error('[Bot] Failed to start:', err);
  process.exit(1);
});
