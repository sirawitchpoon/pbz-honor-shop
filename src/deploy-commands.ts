import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';

const TOKEN = process.env.DISCORD_TOKEN!;
const CLIENT_ID = process.env.CLIENT_ID!;
const GUILD_ID = process.env.GUILD_ID;

async function deploy() {
  const commands: any[] = [];
  const commandsDir = path.join(__dirname, 'commands');

  const files = fs.readdirSync(commandsDir).filter((f) => f.endsWith('.ts') || f.endsWith('.js'));
  for (const file of files) {
    const mod = await import(path.join(commandsDir, file));
    if (mod.data) {
      commands.push(mod.data.toJSON());
      console.log(`[Deploy] Loaded command: ${mod.data.name}`);
    }
  }

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  try {
    console.log(`[Deploy] Registering ${commands.length} command(s)...`);

    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
        body: commands,
      });
      console.log(`[Deploy] Guild commands registered (guild: ${GUILD_ID})`);
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), {
        body: commands,
      });
      console.log('[Deploy] Global commands registered');
    }
  } catch (error) {
    console.error('[Deploy] Failed:', error);
  }
}

deploy();
