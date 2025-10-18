// ================================
// 🌍 Traduttore Chat Alliance — fix finale (niente doppioni, no traduzioni dal globale)
// ================================

import dotenv from "dotenv";
import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes } from "discord.js";
import express from "express";

dotenv.config();
const DEBUG = process.env.DEBUG_LOG === "true";

// Colori console
const c = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  yellow: "\x1b[33m",
};

// Tempo
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

// Keep-alive server (Render)
const app = express();
app.get("/", (_, res) => res.send("✅ Traduttore attivo"));
const port = process.env.PORT || 10000;
app.listen(port, () =>
  console.log(`${c.green}${timeTag()} 🌐 Server attivo su porta ${port}${c.reset}`)
);

// Client Discord
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
if (globalThis.tradRunning) {
  console.log(`${c.red}${timeTag()} ⛔ Istanza duplicata - uscita.${c.reset}`);
  process.exit(0);
}
globalThis.tradRunning = true;

// Config canali
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

// Traduzione tramite Google free API
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
  } catch {
    return text;
  }
}

// Cooldown
const cooldowns = new Map();
const DEFAULT_COOLDOWN = Number(process.env.COOLDOWN_MS) || 2000;
const REMOVE_REACTION_MS = Number(process.env.REMOVE_REACTION_MS) || 5000;

function getCooldownMs(langCode) {
  const key = `COOLDOWN_${langCode.toUpperCase()}_MS`;
  return Number(process.env[key]) || DEFAULT_COOLDOWN;
}
async function handleRateLimit(msg, langCode) {
  const ms = getCooldownMs(langCode);
  const now = Date.now();
  const key = `${msg.author.id}_${msg.channel.id}`;
  const last = cooldowns.get(key) || 0;
  if (now - last < ms) {
    try {
      await msg.react("🕒");
      setTimeout(() => msg.reactions.cache.get("🕒")?.remove().catch(() => {}), REMOVE_REACTION_MS);
    } catch {}
    return true;
  }
  cooldowns.set(key, now);
  return false;
}

// Ready
client.once("clientready", async () => {
  console.log(`${c.green}${timeTag()} ✅ Bot online come ${client.user.tag}${c.reset}`);
  const cmds = [
    { name: "ping", description: "Mostra la latenza" },
    { name: "status", description: "Mostra lo stato del traduttore" },
  ];
  try {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: cmds });
  } catch {}
});

// Gestione messaggi
client.on("messageCreate", async (msg) => {
  try {
    if (!msg.guild || msg.author.bot || msg.author.id === client.user.id) return;
    const text = msg.content?.trim();
    if (!text) return;

    const firstEmbed = msg.embeds?.[0];
    const footerText = firstEmbed?.footer?.text?.toLowerCase?.() || "";
    if (
      footerText.includes("|t-bot|") ||
      firstEmbed?.author?.name?.toLowerCase()?.includes("t-bot") ||
      msg.webhookId
    )
      return;

    const guild = msg.guild;
    const cname = msg.channel.name.toLowerCase();

    // ❌ 1) Se messaggio proviene dal canale globale → ignoralo completamente
    if (cname === globalChannelName.toLowerCase()) return;

    // 🔹 Identifica lingua sorgente in modo flessibile
    const src =
      Object.entries(channelLanguages).find(([key]) => cname.includes(key))?.[1] ||
      null;
    if (!src) return;

    const flood = await handleRateLimit(msg, src.code);
    if (flood) return;

    const globalChannel = guild.channels.cache.find(
      (c) => c.name.toLowerCase() === globalChannelName
    );

    // 1️⃣ Copia messaggio originale nel canale globale
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

    // 2️⃣ Traduzioni verso gli altri canali linguistici
    for (const [destName, destInfo] of Object.entries(channelLanguages)) {
      // evita il canale d'origine
      if (destName === cname) continue;

      const destChannel = guild.channels.cache.find(
        (c) => c.name.toLowerCase() === destName
      );
      if (!destChannel) continue;

      const translated = await translateText(text, src.code, destInfo.code);
      if (!translated) continue;

      const emb = new EmbedBuilder()
        .setColor(destInfo.color)
        .setAuthor({
          name: msg.author.username,
          iconURL: msg.author.displayAvatarURL(),
        })
        .setDescription(`💬 ${translated}`)
        .setFooter({
          text: `Tradotto da ${src.flag} ${src.code.toUpperCase()} → ${destInfo.flag} ${destInfo.code.toUpperCase()} |T-BOT|`,
        });

      await destChannel.send({ embeds: [emb] });
    }
  } catch (err) {
    console.error(`${c.red}${timeTag()} 💥 Errore messaggio:${c.reset}`, err);
  }
});

// Comandi /ping /status
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
    const emb = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("🤖 Stato Traduttore")
      .setDescription(
        `🟢 Online come **${client.user.tag}**\n⏱️ Cooldown default: ${DEFAULT_COOLDOWN} ms\n💬 Ignora completamente i messaggi da #${globalChannelName}`
      )
      .setTimestamp();
    return i.reply({ embeds: [emb], ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);
