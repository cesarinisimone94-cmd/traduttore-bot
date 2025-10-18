// ================================
// 🌍 Bot Traduttore Multicanale — vFinale + DEBUG_LOG + colori + timestamp
// ================================

import dotenv from "dotenv";
import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes } from "discord.js";
import express from "express";

// ================================
// 🌐 Server HTTP — keepalive Render
// ================================
const app = express();
app.get("/", (_req, res) => res.send("✅ Traduttore Bot attivo e in ascolto!"));
const port = process.env.PORT || 10000;
app.listen(port, "0.0.0.0", () => {
  console.log(`🌐 Server HTTP attivo su 0.0.0.0:${port}`);
});

// ================================
// ⚙️ Configurazione
// ================================
dotenv.config();
const DEBUG = process.env.DEBUG_LOG === "true";

// 🎨 Codici colore ANSI
const cReset = "\x1b[0m";
const cRed = "\x1b[31m";
const cGreen = "\x1b[32m";
const cBlue = "\x1b[34m";
const cYellow = "\x1b[33m";
const cMagenta = "\x1b[35m";

// ⏰ Funzione helper per timestamp
function time() {
  const d = new Date();
  return `[${d.toLocaleTimeString("it-IT", { hour12: false })}]`;
}

// ================================
// 🔗 Client Discord
// ================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

if (globalThis.traduttoreRunning) {
  console.log(`${cRed}${time()} ⛔ Istanza duplicata rilevata, uscita.${cReset}`);
  process.exit(0);
} else {
  globalThis.traduttoreRunning = true;
}

const channelLanguages = {
  "alliance-chat-ita": { code: "it", flag: "🇮🇹", color: 0x3498db },
  "alliance-chat-en": { code: "en", flag: "🇬🇧", color: 0x2ecc71 },
  "alliance-chat-es": { code: "es", flag: "🇪🇸", color: 0xf1c40f },
  "alliance-chat-arab": { code: "ar", flag: "🇸🇦", color: 0x27ae60 },
  "alliance-chat-fr": { code: "fr", flag: "🇫🇷", color: 0x9b59b6 },
  "alliance-chat-ger": { code: "de", flag: "🇩🇪", color: 0xe74c3c },
  "alliance-chat-pol": { code: "pl", flag: "🇵🇱", color: 0xe67e22 },
};
const globalChannelName = "alliance-chat-globale";

client.once("clientReady", async () => {
  console.log(`${cGreen}${time()} ✅ Traduttore ${client.user.tag} è online.${cReset}`);

  const commands = [
    { name: "ping", description: "Mostra la latenza del bot" },
    { name: "status", description: "Mostra lo stato attuale del bot traduttore" },
  ];

  try {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log(`${cBlue}${time()} ✅ Comandi /ping e /status registrati.${cReset}`);
  } catch (err) {
    console.error(`${cRed}${time()} ❌ Errore registrazione comandi:${cReset}`, err);
  }
});

// ================================
// 🔧 Funzione di traduzione
// ================================
async function translateText(text, from, to) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(
      text
    )}`;
    const res = await fetch(url);
    const data = await res.json();
    const raw = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : [];
    const translated = raw
      .map((chunk) => (Array.isArray(chunk) ? chunk[0] : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return translated || text;
  } catch (err) {
    console.error(`${cRed}${time()} ❌ Errore API traduzione (${from}→${to}):${cReset}`, err.message);
    return text;
  }
}

// ================================
// 🗣️ Gestione messaggi
// ================================
client.on("messageCreate", async (message) => {
  try {
    if (!message.guild) return;
    if (message.author.bot) return;
    if (message.author.id === client.user.id) return;

    const text = message.content?.trim();
    if (!text) return;

    const footerText = message.embeds?.[0]?.footer?.text?.toLowerCase() || "";
    if (footerText.includes("|t-bot|")) return;

    const channelName = message.channel.name.toLowerCase();
    const sourceInfo =
      channelName === globalChannelName ? null : channelLanguages[channelName];
    const globalChannel = message.guild.channels.cache.find(
      (c) => c.name.toLowerCase() === globalChannelName
    );

    if (DEBUG)
      console.log(`${cBlue}${time()} 📨 ${message.author.username} → #${channelName}:${cReset} ${text}`);

    // 🔹 Caso 1 — canale globale
    if (channelName === globalChannelName) {
      const flagMatch = message.embeds?.[0]?.footer?.text?.match(/([🇦-🏴])/u);
      const originalLang = flagMatch
        ? Object.values(channelLanguages).find((v) => v.flag === flagMatch[1])
        : null;

      for (const [targetName, targetInfo] of Object.entries(channelLanguages)) {
        if (originalLang && targetInfo.code === originalLang.code) continue;

        const targetChannel = message.guild.channels.cache.find(
          (c) => c.name.toLowerCase() === targetName
        );
        if (!targetChannel) continue;

        const tradotto = await translateText(text, "auto", targetInfo.code);
        if (DEBUG)
          console.log(
            `${cYellow}${time()} 🌍 Traduzione da 🌍 (globale)${
              originalLang ? ` (orig:${originalLang.code})` : ""
            } → ${targetInfo.flag}${targetInfo.code}:${cReset} ${tradotto.slice(0, 60)}${
              tradotto.length > 60 ? "..." : ""
            }`
          );

        if (!tradotto) continue;
        const embed = new EmbedBuilder()
          .setColor(targetInfo.color)
          .setAuthor({
            name: message.author.username,
            iconURL: message.author.displayAvatarURL(),
          })
          .setDescription(`💬 ${tradotto}`)
          .setFooter({
            text: `Tradotto da 🌍 (globale) → ${targetInfo.flag} ${targetInfo.code.toUpperCase()} |T-BOT|`,
          });

        await targetChannel.send({ embeds: [embed] });
      }
      return;
    }

    // 🔹 Caso 2 — canale lingua specifica
    if (!sourceInfo) return;

    for (const [targetName, targetInfo] of Object.entries(channelLanguages)) {
      if (targetName === channelName || targetInfo.code === sourceInfo.code)
        continue;

      const targetChannel = message.guild.channels.cache.find(
        (c) => c.name.toLowerCase() === targetName
      );
      if (!targetChannel) continue;

      const tradotto = await translateText(text, sourceInfo.code, targetInfo.code);
      if (DEBUG)
        console.log(
          `${cGreen}${time()} 🌐 Traduzione ${sourceInfo.flag}${sourceInfo.code} → ${targetInfo.flag}${targetInfo.code}:${cReset} ${tradotto.slice(
            0,
            60
          )}${tradotto.length > 60 ? "..." : ""}`
        );

      if (!tradotto) continue;
      const embed = new EmbedBuilder()
        .setColor(targetInfo.color)
        .setAuthor({
          name: message.author.username,
          iconURL: message.author.displayAvatarURL(),
        })
        .setDescription(`💬 ${tradotto}`)
        .setFooter({
          text: `Tradotto da ${sourceInfo.flag} ${sourceInfo.code.toUpperCase()} → ${targetInfo.flag} ${targetInfo.code.toUpperCase()} |T-BOT|`,
        });

      await targetChannel.send({ embeds: [embed] });
    }

    // 🔹 Copia nel canale globale
    if (globalChannel && channelName !== globalChannelName) {
      const embedOriginal = new EmbedBuilder()
        .setColor(0x95a5a6)
        .setAuthor({
          name: message.author.username,
          iconURL: message.author.displayAvatarURL(),
        })
        .setDescription(`💬 ${text}`)
        .setFooter({
          text: `${sourceInfo.flag} Messaggio originale da ${channelName} |T-BOT|`,
        });

      await globalChannel.send({ embeds: [embedOriginal] });
    }
  } catch (err) {
    console.error(`${cRed}${time()} 💥 Errore handler:${cReset}`, err);
  }
});

// ================================
// 💬 Comandi /ping /status
// ================================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    const latency = Date.now() - interaction.createdTimestamp;
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2ecc71)
          .setDescription(`🏓 Pong! Latenza: **${latency} ms**`),
      ],
      ephemeral: true,
    });
  }

  if (interaction.commandName === "status") {
    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("🤖 Stato del Traduttore Bot")
      .setDescription(
        `🟢 Online come **${client.user.tag}**\n📡 Guilds: **${client.guilds.cache.size}**\n🕓 Orario server: **${time()}**\n⚙️ Log Debug: **${
          DEBUG ? "ATTIVO" : "SPENTO"
        }**`
      )
      .setTimestamp()
      .setFooter({ text: "System check completato |T-BOT|" });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

// ================================
// 🔑 Login
// ================================
client.login(process.env.DISCORD_TOKEN);
