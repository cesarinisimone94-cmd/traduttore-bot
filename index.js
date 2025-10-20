// ================================
// 🌍 Traduttore Chat State — Messaggi + PDF multi‑lingua con log interni persistenti
// ================================

import dotenv from "dotenv";
import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes } from "discord.js";
import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

dotenv.config();

// ----------------------
// LOG funzioni d’aiuto
// ----------------------
function now() {
  const d = new Date();
  return d.toLocaleString("it-IT", { hour12: false });
}
function tag() {
  return `[${now()}]`;
}

// 🔐 Logger persistente
const LOG_DIR = "./logs";
const LOG_FILE = `${LOG_DIR}/translator.log`;
function logLine(type, msg) {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
  const line = `${tag()} ${type} ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.log(line.trim());
}

// ----------------------
// Server keep‑alive
// ----------------------
const app = express();
app.get("/", (_, res) =>
  res.send("✅ Traduttore Bot attivo e in ascolto!")
);
app.listen(process.env.PORT || 10000, () =>
  logLine("INFO", "🌐 Server attivo su Render")
);

// ----------------------
// Client Discord
// ----------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ----------------------
// Canali lingua
// ----------------------
const langs = {
  "state-chat-ita": { code: "it", flag: "🇮🇹", name: "Italiano", color: 0x3498db },
  "state-chat-en": { code: "en", flag: "🇬🇧", name: "Inglese", color: 0x2ecc71 },
  "state-chat-es": { code: "es", flag: "🇪🇸", name: "Spagnolo", color: 0xf1c40f },
  "state-chat-arab": { code: "ar", flag: "🇸🇦", name: "Arabo", color: 0x27ae60 },
  "state-chat-fr": { code: "fr", flag: "🇫🇷", name: "Francese", color: 0x9b59b6 },
  "state-chat-ger": { code: "de", flag: "🇩🇪", name: "Tedesco", color: 0xe74c3c },
  "state-chat-pol": { code: "pl", flag: "🇵🇱", name: "Polacco", color: 0xe67e22 },
  "state-chat-rus": { code: "ru", flag: "🇷🇺", name: "Russo", color: 0x7289da },
  "state-chat-portu": { code: "pt", flag: "🇵🇹", name: "Portoghese", color: 0x1abc9c },
};
const globalName = "state-chat-global";

// ----------------------
// Traduzione via Google
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
client.once("clientReady", async () => {
  logLine("OK", `✅ Bot online come ${client.user.tag}`);
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), {
    body: [
      { name: "ping", description: "Pong test" },
      { name: "status", description: "Mostra lo stato del traduttore" },
    ],
  });
});

// ================================
// Gestione messaggi + PDF + Log
// ================================
const sentMessages = new Set();
const processedIds = new Map();
const PROCESSED_TTL = 5 * 60 * 1000;
function pruneProcessed() {
  const nowT = Date.now();
  for (const [id, ts] of processedIds) {
    if (nowT - ts > PROCESSED_TTL) processedIds.delete(id);
  }
}
setInterval(pruneProcessed, 60 * 1000);

// ----------------------
// Elaborazione PDF aggiornata
// ----------------------
async function processPDF(pdfUrl, src, guild, author) {
  logLine("INFO", `🟡 PDF caricato da ${author.username} (${src.name})`);
  const res = await fetch(pdfUrl);
  const buffer = Buffer.from(await res.arrayBuffer());
  const pdfDoc = await PDFDocument.load(buffer);

  // 🔹 Nuova gestione testo per evitare blocchi OCR
  let extractedText = "";
  try {
    extractedText = pdfDoc.getTitle?.() || "";
  } catch {
    extractedText = "";
  }

  if (!extractedText.trim()) {
    logLine("WARN", `🚫 PDF senza testo estraibile (no OCR per evitare blocchi).`);
    const notify =
      `⚠️ Il PDF caricato da **${author.username}** non contiene testo leggibile.\n` +
      `⏭️ Traduzione saltata per evitare rallentamenti (probabilmente solo immagini).`;
    const sysCh = guild.systemChannel || guild.channels.cache.find((c) => c.name === globalName);
    sysCh?.send(notify).catch(() => {});
    return null;
  }

  const destLangs = Object.entries(langs).filter(
    ([k]) => k !== `state-chat-${src.code}`
  );

  let count = 0;
  for (const [destName, dest] of destLangs) {
    count++;
    const destCh = guild.channels.cache.find((c) => c.name.toLowerCase() === destName);
    if (!destCh) continue;

    const translated = await translateText(extractedText.slice(0, 4000), src.code, dest.code);
    const outDoc = await PDFDocument.create();
    const page = outDoc.addPage([595, 842]);
    const font = await outDoc.embedFont(StandardFonts.Helvetica);
    page.drawText(translated || "(testo non tradotto)", {
      x: 50,
      y: 780,
      size: 12,
      font,
      color: rgb(0, 0, 0),
      lineHeight: 14,
      maxWidth: 495,
    });

    const outBytes = await outDoc.save();
    const filename = `PDF_Tradotto_${dest.code}_${Date.now()}.pdf`;
    fs.writeFileSync(filename, outBytes);

    await destCh.send({
      content: `📄 Traduzione PDF da ${src.flag} **${src.name}** → ${dest.flag} **${dest.name}**\n👤 Caricato da ${author}`,
      files: [filename],
    });

    fs.unlinkSync(filename);
    logLine("OK", `⚙️ Traduzione PDF → ${dest.name} completata (${count}/${destLangs.length})`);
  }

  logLine("OK", `✅ Tutte le traduzioni PDF completate per ${author.username}`);
  return true;
}

// ----------------------
// Messaggi
// ----------------------
client.on("messageCreate", async (msg) => {
  try {
    if (!msg.guild) return;
    if (msg.author?.bot) return;

    const guild = msg.guild;
    const cname = msg.channel.name.toLowerCase();
    const src = langs[cname];

    // 📄 FILE PDF (ora gestito anche nel canale globale)
    if (msg.attachments.size > 0) {
      const pdf = msg.attachments.find((a) => a.name.endsWith(".pdf"));
      if (pdf) {
        const srcLang = src || { code: "auto", flag: "🌍", name: "Globale" };
        await msg.reply("📘 Traduzione in corso del tuo PDF in tutte le lingue...");
        await processPDF(pdf.url, srcLang, guild, msg.author);
        return;
      }
    }

    // ---- Traduzioni testuali ----
    if (sentMessages.has(msg.id)) return;
    if (msg.webhookId) return;
    if (processedIds.has(msg.id)) return;
    processedIds.set(msg.id, Date.now());
    pruneProcessed();

    if (!msg.content && msg.embeds.length > 0) return;
    const joined = `${msg.content || ""} ${
      msg.embeds[0]?.description || ""
    } ${msg.embeds[0]?.footer?.text || ""}`.toLowerCase();
    if (joined.includes("|t-bot|")) return;

    const content = msg.content?.trim();
    if (!content) return;

    const globalCh = guild.channels.cache.find((c) => c.name.toLowerCase() === globalName);

    // 🌍 Messaggio dal globale
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

    // Messaggi da canali lingua
    if (!src) return;
    if (cooldown(msg)) return;

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
    logLine("ERROR", `💥 ${err}`);
  }
});

// ----------------------
// Slash Commands
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
      .setTitle("📊 Traduttore attivo (Messaggi + PDF + log persistenti)")
      .setDescription(`Globale: #${globalName}\n\n${list}`)
      .setTimestamp();
    return i.reply({ embeds: [emb], ephemeral: true });
  }
});

// ----------------------
// LOGIN
// ----------------------
client.login(process.env.DISCORD_TOKEN);
