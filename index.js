// ================================
// 🌍 Traduttore Chat Alliance — Cooldown per lingua + Reazione 🕒 rimovibile
// ================================

import dotenv from "dotenv";
import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes } from "discord.js";
import express from "express";

dotenv.config();
const DEBUG = process.env.DEBUG_LOG === "true";

// 🎨 Colori console
const c = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  yellow: "\x1b[33m",
};

// 🕓 Timestamp helpers
function time() {
  const d = new Date();
  return d.toLocaleTimeString("it-IT", { hour12: false });
}
function dateShort() {
  const d = new Date();
  return d.toLocaleDateString("it-IT");
}
function timeTag() {
  return `[${dateShort()} ${time()}]`;
}

// 🌐 Server HTTP keep-alive
const app = express();
app.get("/", (_, res) => res.send("✅ Traduttore attivo"));
const port = process.env.PORT || 10000;
app.listen(port, () =>
  console.log(`${c.green}${timeTag()} 🌐 Server attivo su porta ${port}${c.reset}`)
);

// 🤖 Client Discord
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
if (globalThis.tradRunning) {
  console.log(`${c.red}${timeTag()} ⛔ Istanza duplicata - uscita.${c.reset}`);
  process.exit(0);
}
globalThis.tradRunning = true;

// 📜 Canali / Lingue
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

// 🧠 Traduzione (Google libera)
async function translateText(text, from, to) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(
      text
    )}`;
    const res = await fetch(url);
    const j = await res.json();
    const out = (j[0] || [])
      .map((t) => (Array.isArray(t) ? t[0] : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return out || text;
  } catch (err) {
    console.error(`${c.red}${timeTag()} ❌ Errore traduzione ${from}->${to}:${c.reset}`, err.message);
    return text;
  }
}

// 🕒 Rate limiter per lingua
const cooldowns = new Map();
const DEFAULT_COOLDOWN = Number(process.env.COOLDOWN_MS) || 2000;
const REMOVE_REACTION_MS = Number(process.env.REMOVE_REACTION_MS) || 5000;

function getCooldownMs(langCode) {
  const key = `COOLDOWN_${langCode.toUpperCase()}_MS`;
  return Number(process.env[key]) || DEFAULT_COOLDOWN;
}

async function handleRateLimit(msg, langCode) {
  const cd = getCooldownMs(langCode);
  const key = `${msg.author.id}_${msg.channel.id}`;
  const now = Date.now();
  const last = cooldowns.get(key) || 0;
  if (now - last < cd) {
    try {
      await msg.react("🕒");
      setTimeout(() => {
        msg.reactions.cache.get("🕒")?.remove().catch(() => {});
      }, REMOVE_REACTION_MS);
    } catch {}
    if (DEBUG)
      console.log(`${c.yellow}${timeTag()} ⏱️ Flood ignorato (${langCode}) da ${msg.author.username}${c.reset}`);
    return true;
  }
  cooldowns.set(key, now);
  return false;
}

// 🚀 Ready
client.once("ready", async () => {
  console.log(`${c.green}${timeTag()} ✅ Bot online come ${client.user.tag}${c.reset}`);
  const cmds = [
    { name: "ping", description: "Mostra la latenza" },
    { name: "status", description: "Mostra lo stato del traduttore" },
  ];
  try {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: cmds });
    console.log(`${c.blue}${timeTag()} ✅ Comandi /ping /status registrati${c.reset}`);
  } catch (e) {
    console.error(`${c.red}${timeTag()} ❌ Errore comandi:${c.reset}`, e);
  }
});

// 💬 Gestione messaggi
client.on("messageCreate", async (msg) => {
  try {
    if (!msg.guild || msg.author.bot || msg.author.id === client.user.id) return;

    const text = msg.content?.trim();
    if (!text) return;

    const ft = msg.embeds?.[0]?.footer?.text?.toLowerCase() || "";
    if (ft.includes("|t-bot|")) return;

    const guild = msg.guild;
    const cname = msg.channel.name.toLowerCase();
    const src = channelLanguages[cname];
    if (!src) return;

    // 🔸 Rate‑limit basato sulla lingua
    const flood = await handleRateLimit(msg, src.code);
    if (flood) return;

    const globalChannel = guild.channels.cache.find(
      (c) => c.name.toLowerCase() === globalChannelName
    );

    // 1️⃣ Copia nel canale globale (solo messaggio originale)
    if (globalChannel) {
      const embed = new EmbedBuilder()
        .setColor(src.color)
        .setAuthor({
          name: `${src.flag} [${src.code.toUpperCase()} – ${src.name}] ${msg.author.username}`,
          iconURL: msg.author.displayAvatarURL(),
        })
        .setDescription(`💬 ${text}`)
        .setFooter({
          text: `🕒 ${dateShort()} – ${time()} | ${src.flag} Messaggio originale da ${cname} |T-BOT|`,
        });
      await globalChannel.send({ embeds: [embed] });
    }

    // 2️⃣ Traduzioni nei rispettivi canali
    for (const [destName, destInfo] of Object.entries(channelLanguages)) {
      if (destName === cname) continue;
      const dest = guild.channels.cache.find((c) => c.name.toLowerCase() === destName);
      if (!dest) continue;

      const trad = await translateText(text, src.code, destInfo.code);
      if (!trad) continue;

      const emb = new EmbedBuilder()
        .setColor(destInfo.color)
        .setAuthor({ name: msg.author.username, iconURL: msg.author.displayAvatarURL() })
        .setDescription(`💬 ${trad}`)
        .setFooter({
          text: `Tradotto da ${src.flag} ${src.code.toUpperCase()} → ${destInfo.flag} ${destInfo.code.toUpperCase()} |T-BOT|`,
        });
      await dest.send({ embeds: [emb] });
    }
  } catch (err) {
    console.error(`${c.red}${timeTag()} 💥 Errore handler:${c.reset}`, err);
  }
});

// ⚙️ Comandi /ping /status
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
    let cds = `🔸 Default: ${DEFAULT_COOLDOWN} ms`;
    for (const lang of Object.values(channelLanguages)) {
      const custom = getCooldownMs(lang.code);
      if (custom !== DEFAULT_COOLDOWN)
        cds += `\n${lang.flag} ${lang.name}: ${custom} ms`;
    }

    const emb = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("🤖 Stato Traduttore")
      .setDescription(
        `🟢 Online come **${client.user.tag}**\n📡 Guilds: **${client.guilds.cache.size}**\n🕒 Data: ${dateShort()} ${time()}\n⚙️ DEBUG: **${
          DEBUG ? "ON" : "OFF"
        }**\n⏱️ Cooldown:\n${cds}\n🕐 Reazione rimossa: ${REMOVE_REACTION_MS} ms`
      )
      .setTimestamp();
    return i.reply({ embeds: [emb], ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);
