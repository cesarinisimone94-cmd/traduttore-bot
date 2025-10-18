// ================================
// 🌍 Traduttore Chat Alliance — versione finale 2025-10-18
// ================================

import dotenv from "dotenv";
import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes } from "discord.js";
import express from "express";

dotenv.config();
const DEBUG = process.env.DEBUG_LOG === "true";

const c = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  yellow: "\x1b[33m",
};

// Utilità tempo
function time() {
  const d = new Date();
  return d.toLocaleTimeString("it-IT", { hour12: false });
}
function dateShort() {
  const d = new Date();
  return d.toLocaleDateString("it-IT");
}
function timeTag() {
  return `[${dateShort()} ${time()}]`;
}

// 🔁 Keep‑alive per Render
const app = express();
app.get("/", (_, res) => res.send("✅ Traduttore attivo"));
app.listen(process.env.PORT || 10000, () =>
  console.log(`${c.green}${timeTag()} 🌐 Server attivo${c.reset}`)
);

// 🤖 Client Discord
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
if (globalThis.tradRunning) process.exit(0);
globalThis.tradRunning = true;

// 🔤 Canali & lingue
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

// 🌐 Traduzioni via Google Free API
async function translateText(text, from, to) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(
      text
    )}`;
    const res = await fetch(url);
    const data = await res.json();
    const translated = (data[0] || [])
      .map((v) => (Array.isArray(v) ? v[0] : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return translated || text;
  } catch (err) {
    console.error(`${c.red}${timeTag()} ❌ Errore traduzione:${c.reset}`, err.message);
    return text;
  }
}

// ⏱️ Cooldown
const cooldowns = new Map();
const DEFAULT_COOLDOWN = Number(process.env.COOLDOWN_MS) || 2000;
const REMOVE_REACTION_MS = Number(process.env.REMOVE_REACTION_MS) || 5000;

function getCooldownMs(lang) {
  return Number(process.env[`COOLDOWN_${lang.toUpperCase()}_MS`]) || DEFAULT_COOLDOWN;
}
async function handleRateLimit(msg, lang) {
  const cd = getCooldownMs(lang);
  const now = Date.now();
  const key = `${msg.author.id}_${msg.channel.id}`;
  const last = cooldowns.get(key) || 0;
  if (now - last < cd) {
    try {
      await msg.react("🕒");
      setTimeout(() => msg.reactions.cache.get("🕒")?.remove().catch(() => {}), REMOVE_REACTION_MS);
    } catch {}
    return true;
  }
  cooldowns.set(key, now);
  return false;
}

// 🚀 READY
client.once("clientready", async () => {
  console.log(`${c.green}${timeTag()} ✅ Bot online come ${client.user.tag}${c.reset}`);
  try {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: [
        { name: "ping", description: "Mostra la latenza" },
        { name: "status", description: "Mostra lo stato del traduttore" },
      ],
    });
  } catch (e) {
    console.error(`${c.red}${timeTag()} ❌ Comandi:${c.reset}`, e.message);
  }
});

// 💬 Gestione messaggi
client.on("messageCreate", async (msg) => {
  try {
    if (!msg.guild || msg.author.bot || msg.webhookId) return;
    const text = msg.content?.trim();
    if (!text) return;

    const cname = msg.channel.name.toLowerCase();
    const guild = msg.guild;
    const globalChannel = guild.channels.cache.find(
      (c) => c.name.toLowerCase() === globalChannelName
    );
    const srcInfo = channelLanguages[cname];

    // 🔹 Caso A) messaggio dal canale GLOBALE
    if (cname === globalChannelName.toLowerCase()) {
      // Traduci per ogni canale lingua
      for (const [destName, destInfo] of Object.entries(channelLanguages)) {
        const destChannel = guild.channels.cache.find((c) => c.name.toLowerCase() === destName);
        if (!destChannel) continue;
        const translated = await translateText(text, "auto", destInfo.code);
        if (!translated) continue;

        const emb = new EmbedBuilder()
          .setColor(destInfo.color)
          .setAuthor({
            name: msg.author.username,
            iconURL: msg.author.displayAvatarURL(),
          })
          .setDescription(`💬 ${translated}`)
          .setFooter({
            text: `🌍 Tradotto da Globale → ${destInfo.flag} ${destInfo.code.toUpperCase()} |T-BOT|`,
          });

        await destChannel.send({ embeds: [emb] });
      }
      return; // Non tradurre ulteriormente / non copiare in globale
    }

    // 🔹 Caso B) messaggio da canale lingua
    if (!srcInfo) return;

    const flooded = await handleRateLimit(msg, srcInfo.code);
    if (flooded) return;

    // Copia nel canale GLOBALE (solo messaggio originale)
    if (globalChannel) {
      const embOrig = new EmbedBuilder()
        .setColor(srcInfo.color)
        .setAuthor({
          name: `${srcInfo.flag} [${srcInfo.code.toUpperCase()} – ${srcInfo.name}] ${msg.author.username}`,
          iconURL: msg.author.displayAvatarURL(),
        })
        .setDescription(`💬 ${text}`)
        .setFooter({
          text: `🕒 ${dateShort()} – ${time()} | ${srcInfo.flag} Messaggio originale da ${cname} |T-BOT|`,
        });
      await globalChannel.send({ embeds: [embOrig] });
    }

    // Traduzioni nei canali *diversi* dal sorgente
    for (const [destName, destInfo] of Object.entries(channelLanguages)) {
      if (destName === cname) continue;
      const destChannel = guild.channels.cache.find((c) => c.name.toLowerCase() === destName);
      if (!destChannel) continue;

      const translated = await translateText(text, srcInfo.code, destInfo.code);
      if (!translated) continue;

      const emb = new EmbedBuilder()
        .setColor(destInfo.color)
        .setAuthor({
          name: msg.author.username,
          iconURL: msg.author.displayAvatarURL(),
        })
        .setDescription(`💬 ${translated}`)
        .setFooter({
          text: `Tradotto da ${srcInfo.flag} ${srcInfo.code.toUpperCase()} → ${destInfo.flag} ${destInfo.code.toUpperCase()} |T-BOT|`,
        });

      await destChannel.send({ embeds: [emb] });
    }
  } catch (err) {
    console.error(`${c.red}${timeTag()} 💥 Errore messaggio:${c.reset}`, err);
  }
});

// ⚙️ Comandi
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  if (i.commandName === "ping") {
    const latency = Date.now() - i.createdTimestamp;
    return i.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2ecc71)
          .setDescription(`🏓 Pong! Latenza: **${latency} ms**`)
          .setTimestamp(),
      ],
      ephemeral: true,
    });
  }

  if (i.commandName === "status") {
    const list = Object.entries(channelLanguages)
      .map(
        ([ch, l]) =>
          `${l.flag} **${l.name}** → #${ch} (${l.code.toUpperCase()})`
      )
      .join("\n");
    const emb = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("🤖 Stato Traduttore")
      .setDescription(
        `🟢 Online come **${client.user.tag}**\n📡 Chat glob: #${globalChannelName}\n\nLingue supportate:\n${list}`
      )
      .setTimestamp();
    return i.reply({ embeds: [emb], ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);
