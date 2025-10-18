// ================================
// 🌍 Traduttore Chat Alliance — versione "anti‑duplicati" 2025‑10‑18
// ================================

import dotenv from "dotenv";
import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes } from "discord.js";
import express from "express";

dotenv.config();
const c = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
};

// 🕒 helper
function time() {
  return new Date().toLocaleTimeString("it-IT", { hour12: false });
}
function dateShort() {
  return new Date().toLocaleDateString("it-IT");
}
function timeTag() {
  return `[${dateShort()} ${time()}]`;
}

// 🌐 keep‑alive
const app = express();
app.get("/", (_, res) => res.send("✅ Traduttore attivo"));
app.listen(process.env.PORT || 10000, () =>
  console.log(`${c.green}${timeTag()} 🌐 Server attivo${c.reset}`)
);

// 🤖 client Discord
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
if (globalThis.running) process.exit(0);
globalThis.running = true;

// Lingue
const channelLanguages = {
  "alliance-chat-ita": { code: "it", flag: "🇮🇹", name: "Italiano", color: 0x3498db },
  "alliance-chat-en": { code: "en", flag: "🇬🇧", name: "Inglese", color: 0x2ecc71 },
  "alliance-chat-es": { code: "es", flag: "🇪🇸", name: "Spagnolo", color: 0xf1c40f },
  "alliance-chat-arab": { code: "ar", flag: "🇸🇦", name: "Arabo", color: 0x27ae60 },
  "alliance-chat-fr": { code: "fr", flag: "🇫🇷", name: "Francese", color: 0x9b59b6 },
  "alliance-chat-ger": { code: "de", flag: "🇩🇪", name: "Tedesco", color: 0xe74c3c },
  "alliance-chat-pol": { code: "pl", flag: "🇵🇱", name: "Polacco", color: 0xe67e22 },
};
const globalChannelName = "alliance-chat-globale";

// Traduzione
async function translateText(text, from, to) {
  try {
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(
        text
      )}`
    );
    const data = await res.json();
    const out = (data[0] || [])
      .map((v) => (Array.isArray(v) ? v[0] : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return out || text;
  } catch {
    return text;
  }
}

// Cooldown
const cooldowns = new Map();
const DEFAULT_COOLDOWN = 2000;
async function handleCooldown(msg, lang) {
  const now = Date.now();
  const key = `${msg.author.id}_${msg.channel.id}`;
  const last = cooldowns.get(key) || 0;
  if (now - last < DEFAULT_COOLDOWN) return true;
  cooldowns.set(key, now);
  return false;
}

// Ready
client.once("clientready", async () => {
  console.log(`${c.green}${timeTag()} ✅ Bot online come ${client.user.tag}${c.reset}`);
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), {
    body: [
      { name: "ping", description: "Ping del bot" },
      { name: "status", description: "Mostra lo stato del traduttore" },
    ],
  });
});

// 🔰 Messaggi
client.on("messageCreate", async (msg) => {
  try {
    if (!msg.guild) return;
    if (msg.author.bot) return; // blocca ogni bot (incluso sé stesso)
    const content = msg.content?.trim();
    if (!content) return;

    // blocca eventuali embed o msg già tradotti
    const firstEmbed = msg.embeds?.[0];
    const footer = firstEmbed?.footer?.text?.toLowerCase?.() || "";
    if (footer.includes("|t-bot|")) return;

    const cname = msg.channel.name.toLowerCase();
    const guild = msg.guild;
    const globalChannel = guild.channels.cache.find(
      (c) => c.name.toLowerCase() === globalChannelName
    );

    // 🔹 Caso 1: scritto nel canale GLOBALE
    if (cname === globalChannelName.toLowerCase()) {
      console.log(`${c.green}${timeTag()} 🌍 Messaggio dal GLOBAL tradotto nei canali lingua${c.reset}`);
      for (const [destName, destInfo] of Object.entries(channelLanguages)) {
        const destChannel = guild.channels.cache.find((c) => c.name.toLowerCase() === destName);
        if (!destChannel) continue;
        const translated = await translateText(content, "auto", destInfo.code);
        if (!translated) continue;

        const emb = new EmbedBuilder()
          .setColor(destInfo.color)
          .setAuthor({ name: msg.author.username, iconURL: msg.author.displayAvatarURL() })
          .setDescription(`💬 ${translated}`)
          .setFooter({
            text: `🌍 Da Globale → ${destInfo.flag} ${destInfo.code.toUpperCase()} |T-BOT|`,
          });
        await destChannel.send({ embeds: [emb] });
      }
      return;
    }

    // 🔹 Caso 2: scritto in un canale linguistico
    const srcLang = channelLanguages[cname];
    if (!srcLang) return;

    if (await handleCooldown(msg, srcLang.code)) return;

    // Copia nel GLOBALE (solo originale)
    if (globalChannel) {
      const embOrig = new EmbedBuilder()
        .setColor(srcLang.color)
        .setAuthor({
          name: `${srcLang.flag} [${srcLang.code.toUpperCase()}] ${msg.author.username}`,
          iconURL: msg.author.displayAvatarURL(),
        })
        .setDescription(`💬 ${content}`)
        .setFooter({
          text: `🕒 ${dateShort()} – ${time()} | ${srcLang.flag} Da ${cname} |T-BOT|`,
        });
      await globalChannel.send({ embeds: [embOrig] });
    }

    // Traduzioni negli altri canali
    for (const [destName, destInfo] of Object.entries(channelLanguages)) {
      if (destName === cname) continue; // salta se stesso
      const destChannel = guild.channels.cache.find((c) => c.name.toLowerCase() === destName);
      if (!destChannel) continue;
      const translated = await translateText(content, srcLang.code, destInfo.code);
      if (!translated) continue;

      const emb = new EmbedBuilder()
        .setColor(destInfo.color)
        .setAuthor({ name: msg.author.username, iconURL: msg.author.displayAvatarURL() })
        .setDescription(`💬 ${translated}`)
        .setFooter({
          text: `Tradotto da ${srcLang.flag} ${srcLang.code.toUpperCase()} → ${destInfo.flag} ${destInfo.code.toUpperCase()} |T-BOT|`,
        });
      await destChannel.send({ embeds: [emb] });
    }
  } catch (e) {
    console.error(`${c.red}${timeTag()} 💥 Errore:${c.reset}`, e);
  }
});

// Slash commands
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;
  if (i.commandName === "ping")
    return i.reply({ content: `🏓 Pong! ${Date.now() - i.createdTimestamp} ms`, ephemeral: true });
  if (i.commandName === "status") {
    const langs = Object.entries(channelLanguages)
      .map(([k, v]) => `${v.flag} #${k} (${v.code.toUpperCase()})`)
      .join("\n");
    const emb = new EmbedBuilder()
      .setColor(0x00aaff)
      .setTitle("📊 Stato Traduttore")
      .setDescription(`Canali supportati:\n${langs}\n\nGlobale: #${globalChannelName}`)
      .setTimestamp();
    return i.reply({ embeds: [emb], ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);
