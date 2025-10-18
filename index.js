// ================================
// 🌍 Traduttore Chat Alliance — versione definitiva (globale + no duplicati 🇫🇷🇸🇦)
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

// 🕓 Funzioni di tempo
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

// 🌐 Keep‑alive server (Render/Replit)
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

// 📜 Canali/Lingue
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

// 🧠 Funzione di traduzione (Google free API)
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

// 🕒 Gestione cooldown
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
client.once("clientready", async () => {
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

// 💬 Gestione messaggi — definitiva
client.on("messageCreate", async (msg) => {
  try {
    if (!msg.guild || msg.author.bot || msg.author.id === client.user.id) return;
    const text = msg.content?.trim();
    if (!text) return;

    // 🛡️ Evita di ritradurre embed o webhook del bot
    const firstEmbed = msg.embeds?.[0];
    const footerText = firstEmbed?.footer?.text?.toLowerCase?.() || "";
    if (
      footerText.includes("|t-bot|") ||
      firstEmbed?.author?.name?.toLowerCase()?.includes("t-bot") ||
      msg.webhookId
    ) {
      if (DEBUG)
        console.log(`${c.yellow}${timeTag()} ⛔ Ignorato embed T-BOT (evita doppioni)${c.reset}`);
      return;
    }

    const guild = msg.guild;
    const cname = msg.channel.name.toLowerCase();

    // 🔹 Lingua sorgente: ricerca flessibile
    let src = Object.entries(channelLanguages).find(([key]) => cname.includes(key))?.[1];

    // Se siamo nel canale GLOBALE → lingua "auto"
    if (!src && cname === globalChannelName.toLowerCase()) {
      src = { code: "auto", flag: "🌍", name: "Globale", color: 0x95a5a6 };
    }
    if (!src) return;

    // 🔹 Anti-flood
    const flood = await handleRateLimit(msg, src.code);
    if (flood) return;

    const globalChannel = guild.channels.cache.find(
      (c) => c.name.toLowerCase() === globalChannelName
    );

    if (DEBUG)
      console.log(`${c.blue}${timeTag()} 📨 ${msg.author.username} → #${cname}:${c.reset} ${text}`);

    // 1️⃣ Copia messaggio originale nel canale globale (solo se non proviene già da lì)
    if (globalChannel && cname !== globalChannelName.toLowerCase()) {
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

    // 2️⃣ Traduzioni — senza duplicati
    for (const [destName, destInfo] of Object.entries(channelLanguages)) {
      if (destName === cname) continue; // evita di tradurre nel canale d'origine

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

    // 🔹 Se messaggio viene dal canale globale → mostra embed locale
    if (cname === globalChannelName.toLowerCase() && globalChannel) {
      const embGlobal = new EmbedBuilder()
        .setColor(src.color)
        .setAuthor({
          name: `${src.flag} [${src.code.toUpperCase()} – ${src.name}] ${msg.author.username}`,
          iconURL: msg.author.displayAvatarURL(),
        })
        .setDescription(`💬 ${text}`)
        .setFooter({
          text: `🕒 ${dateShort()} – ${time()} | 🌍 Messaggio originale dal canale globale |T-BOT|`,
        });
      await globalChannel.send({ embeds: [embGlobal] });
      if (DEBUG)
        console.log(`${c.green}${timeTag()} 🌍 Traduzione avviata dal canale globale${c.reset}`);
    }
  } catch (err) {
    console.error(`${c.red}${timeTag()} 💥 Errore gestione messaggio:${c.reset}`, err);
  }
});

// ⚙️ Comandi /ping /status
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
