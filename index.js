// ================================
// 🌍 Traduttore Chat Alliance — FIX finale no‑duplicazioni + Anti‑duplicati Gateway
// ================================

import dotenv from "dotenv";
import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes } from "discord.js";
import express from "express";

dotenv.config();

// ----------------------
// LOG funzioni d’aiuto
// ----------------------
const c = { reset: "\x1b[0m", green: "\x1b[32m", red: "\x1b[31m" };
function now() {
  const d = new Date();
  return d.toLocaleString("it-IT", { hour12: false });
}
function tag() {
  return `[${now()}]`;
}

// ----------------------
// Server keep‑alive
// ----------------------
const app = express();
app.get("/", (_, res) => res.send("✅ Traduttore attivo"));
app.listen(process.env.PORT || 10000, () =>
  console.log(`${c.green}${tag()} 🌐 Server attivo${c.reset}`)
);

// ----------------------
// Client Discord
// ----------------------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// Map canali
const langs = {
  "alliance-chat-ita": { code: "it", flag: "🇮🇹", name: "Italiano", color: 0x3498db },
  "alliance-chat-en": { code: "en", flag: "🇬🇧", name: "Inglese", color: 0x2ecc71 },
  "alliance-chat-es": { code: "es", flag: "🇪🇸", name: "Spagnolo", color: 0xf1c40f },
  "alliance-chat-arab": { code: "ar", flag: "🇸🇦", name: "Arabo", color: 0x27ae60 },
  "alliance-chat-fr": { code: "fr", flag: "🇫🇷", name: "Francese", color: 0x9b59b6 },
  "alliance-chat-ger": { code: "de", flag: "🇩🇪", name: "Tedesco", color: 0xe74c3c },
  "alliance-chat-pol": { code: "pl", flag: "🇵🇱", name: "Polacco", color: 0xe67e22 },
};
const globalName = "alliance-chat-globale";

// ----------------------
// Traduzione Google API
// ----------------------
async function translateText(txt, from, to) {
  try {
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(
        txt
      )}`
    );
    const data = await res.json();
    const translated = (data[0] || [])
      .map((v) => (Array.isArray(v) ? v[0] : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return translated || txt;
  } catch {
    return txt;
  }
}

// ----------------------
// Cooldown
// ----------------------
const cooldowns = new Map();
const CD_MS = 2000;
function cooldown(msg) {
  const key = `${msg.author.id}_${msg.channel.id}`;
  const nowT = Date.now();
  if (nowT - (cooldowns.get(key) || 0) < CD_MS) return true;
  cooldowns.set(key, nowT);
  return false;
}

// ----------------------
// ON READY
// ----------------------
client.once("clientready", async () => {
  console.log(`${c.green}${tag()} ✅ Bot online come ${client.user.tag}${c.reset}`);
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), {
    body: [
      { name: "ping", description: "Pong test" },
      { name: "status", description: "Mostra lo stato del traduttore" },
    ],
  });
});

// ================================
// Gestione messaggi — FIX definitivo anti-doppioni + Logger diagnostico
// ================================
const sentMessages = new Set();
const processedIds = new Map(); // ID messaggi già processati (TTL 5 min)
const PROCESSED_TTL = 5 * 60 * 1000; // 5 minuti

// funzione per pulire la cache
function pruneProcessed() {
  const nowT = Date.now();
  for (const [id, ts] of processedIds) {
    if (nowT - ts > PROCESSED_TTL) processedIds.delete(id);
  }
}
setInterval(pruneProcessed, 60 * 1000); // pulizia ogni 60 s

client.on("messageCreate", async (msg) => {
  try {
    if (!msg.guild) return;

    // 🔒 blocco auto‑messaggi
    if (sentMessages.has(msg.id)) return;
    if (msg.author?.id === client.user.id) return;
    if (msg.author?.bot) return;
    if (msg.webhookId) return;

    // ⚡ Anti‑duplicati su ID
    if (processedIds.has(msg.id)) {
      console.log(`${c.red}${tag()} ⚙️ Ignorato duplicato msg.id=${msg.id}${c.reset}`);
      return;
    }
    processedIds.set(msg.id, Date.now());

    // 🧹 ripulisci ogni tanto
    pruneProcessed();

    // Evita embed puri
    if (!msg.content && msg.embeds.length > 0) return;

    // Blocca messaggi del bot
    const joined = `${msg.content || ""} ${
      msg.embeds[0]?.description || ""
    } ${msg.embeds[0]?.footer?.text || ""}`.toLowerCase();
    if (joined.includes("|t-bot|")) return;

    const content = msg.content?.trim();
    if (!content) return;

    const guild = msg.guild;
    const cname = msg.channel.name.toLowerCase();
    const globalCh = guild.channels.cache.find((c) => c.name.toLowerCase() === globalName);
    const src = langs[cname];

    // 🌍 Messaggio dal globale → traduzioni in tutti i canali lingua
    if (cname === globalName.toLowerCase()) {
      for (const [destName, dest] of Object.entries(langs)) {
        const destCh = guild.channels.cache.find((c) => c.name.toLowerCase() === destName);
        if (!destCh) continue;

        const t = await translateText(content, "auto", dest.code);
        if (!t) continue;

        const emb = new EmbedBuilder()
          .setColor(dest.color)
          .setAuthor({ name: msg.author.username, iconURL: msg.author.displayAvatarURL() })
          .setDescription(`💬 ${t}`)
          .setFooter({ text: `🌍 Da Globale → ${dest.flag} ${dest.code.toUpperCase()} |T-BOT|` });

        const sent = await destCh.send({ embeds: [emb] });
        sentMessages.add(sent.id);
        setTimeout(() => sentMessages.delete(sent.id), 60000);
      }
      return;
    }

    // 🗣️ Messaggi da canali lingua
    if (!src) return;
    if (cooldown(msg)) return;

    // → invio nel globale
    if (globalCh) {
      const emb = new EmbedBuilder()
        .setColor(src.color)
        .setAuthor({
          name: `${src.flag} [${src.code.toUpperCase()}] ${msg.author.username}`,
          iconURL: msg.author.displayAvatarURL(),
        })
        .setDescription(`💬 ${content}`)
        .setFooter({
          text: `🕒 ${now()} | ${src.flag} Originale ${src.name} |T-BOT|`,
        });

      const sent = await globalCh.send({ embeds: [emb] });
      sentMessages.add(sent.id);
      setTimeout(() => sentMessages.delete(sent.id), 60000);
    }

    // → traduzioni negli altri canali lingua
    for (const [destName, dest] of Object.entries(langs)) {
      if (destName === cname) continue;
      const destCh = guild.channels.cache.find((c) => c.name.toLowerCase() === destName);
      if (!destCh) continue;

      const t = await translateText(content, src.code, dest.code);
      if (!t) continue;

      const emb = new EmbedBuilder()
        .setColor(dest.color)
        .setAuthor({ name: msg.author.username, iconURL: msg.author.displayAvatarURL() })
        .setDescription(`💬 ${t}`)
        .setFooter({
          text: `Tradotto da ${src.flag} ${src.code.toUpperCase()} → ${dest.flag} ${dest.code.toUpperCase()} |T-BOT|`,
        });

      const sent = await destCh.send({ embeds: [emb] });
      sentMessages.add(sent.id);
      setTimeout(() => sentMessages.delete(sent.id), 60000);
    }
  } catch (err) {
    console.error(`${c.red}${tag()} 💥 Errore:${c.reset}`, err);
  }
});

// ----------------------
// Slash command handler
// ----------------------
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;
  if (i.commandName === "ping") {
    return i.reply({
      content: `🏓 Pong! ${Date.now() - i.createdTimestamp} ms`,
      ephemeral: true,
    });
  }
  if (i.commandName === "status") {
    const list = Object.entries(langs)
      .map(([k, v]) => `${v.flag} #${k} (${v.code.toUpperCase()})`)
      .join("\n");
    const emb = new EmbedBuilder()
      .setColor(0x00aaff)
      .setTitle("📊 Traduttore attivo")
      .setDescription(`Globale: #${globalName}\n\n${list}`)
      .setTimestamp();
    return i.reply({ embeds: [emb], ephemeral: true });
  }
});
// ----------------------
// LOGIN BOT
// ----------------------
client.login(process.env.DISCORD_TOKEN);
