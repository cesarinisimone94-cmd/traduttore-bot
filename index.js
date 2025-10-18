// ================================
// 🌍  Bot Traduttore Multicanale (versione stabile senza duplicati)
// ================================

import dotenv from "dotenv";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import express from "express";

// ================================
// 🌐  Server HTTP per Render
// ================================
const app = express();

app.get("/", (req, res) => {
  res.send("✅ Traduttore Bot attivo e in ascolto!");
});

const port = process.env.PORT || 10000;
app.listen(port, "0.0.0.0", () => {
  console.log(`🌐 Server HTTP attivo su 0.0.0.0:${port}`);
});

// ================================
// ⚙️  Configurazione Discord
// ================================
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// 📘 Mappa canali ↔ lingue + bandiere
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

// L’evento corretto dal warning
client.once("clientReady", () => {
  console.log(`✅ Traduttore ${client.user.tag} è online con messaggi embed.`);
});

// ================================
// 🔧  Funzione di traduzione
// ================================
async function translateText(text, { from = "auto", to = "en" }) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(
      text
    )}`;
    const res = await fetch(url);
    const data = await res.json();
    const translated =
      Array.isArray(data) && Array.isArray(data[0])
        ? data[0].map((el) => el[0]).join("")
        : null;
    if (!translated) throw new Error("Risposta vuota dall'API");
    return translated;
  } catch (err) {
    console.error(`❌ Errore API di traduzione: ${err.message}`);
    return null;
  }
}

// ================================
// 🗣️  Gestione messaggi (anti-duplicato definitivo)
// ================================
client.on("messageCreate", async (message) => {
  // 🛑 Ignora qualsiasi messaggio del bot (testo o embed)
  if (message.author.id === client.user.id) return;
  if (message.author.bot) return;
  if (message.partial || !message.guild) return;

  // 🛑 Ignora messaggi embed già tradotti o originali
  const footerText = message.embeds?.[0]?.footer?.text?.toLowerCase() || "";
  if (
    footerText.includes("tradotto") ||
    footerText.includes("messaggio originale")
  )
    return;

  const channelName = message.channel.name.toLowerCase();
  const text = message.content.trim();
  if (!text) return;

  // 🔹 Caso 1: messaggio inviato nel canale globale
  if (channelName === globalChannelName) {
    for (const [targetName, targetInfo] of Object.entries(channelLanguages)) {
      const targetChannel = message.guild.channels.cache.find(
        (ch) => ch.name.toLowerCase() === targetName
      );
      if (!targetChannel) continue;

      const tradotto = await translateText(text, { to: targetInfo.code });
      if (!tradotto) continue;

      const embed = new EmbedBuilder()
        .setColor(targetInfo.color)
        .setAuthor({
          name: message.author.username,
          iconURL: message.author.displayAvatarURL(),
        })
        .setDescription(`💬 ${tradotto}`)
        .setFooter({
          text: `Tradotto da 🌍 (globale) → ${targetInfo.flag} ${targetInfo.code.toUpperCase()}`,
        });

      await targetChannel.send({ embeds: [embed] });
    }
    return; // ⛔ evita ciclo globale ↔ globale
  }

  // 🔹 Caso 2: messaggio in un canale lingua → traduci verso gli altri
  const sourceInfo = channelLanguages[channelName];
  if (!sourceInfo) return;

  for (const [targetName, targetInfo] of Object.entries(channelLanguages)) {
    if (targetName === channelName || targetInfo.code === sourceInfo.code)
      continue;

    const targetChannel = message.guild.channels.cache.find(
      (ch) => ch.name.toLowerCase() === targetName
    );
    if (!targetChannel) continue;

    const tradotto = await translateText(text, {
      from: sourceInfo.code,
      to: targetInfo.code,
    });
    if (!tradotto) continue;

    const embed = new EmbedBuilder()
      .setColor(targetInfo.color)
      .setAuthor({
        name: message.author.username,
        iconURL: message.author.displayAvatarURL(),
      })
      .setDescription(`💬 ${tradotto}`)
      .setFooter({
        text: `Tradotto da ${sourceInfo.flag} ${sourceInfo.code.toUpperCase()} → ${targetInfo.flag} ${targetInfo.code.toUpperCase()}`,
      });

    await targetChannel.send({ embeds: [embed] });
  }

  // 🔹 Invia anche il messaggio originale nel canale globale (una volta sola)
  const globalChannel = message.guild.channels.cache.find(
    (ch) => ch.name.toLowerCase() === globalChannelName
  );
  if (globalChannel && channelName !== globalChannelName) {
    const embedOriginal = new EmbedBuilder()
      .setColor(0x95a5a6)
      .setAuthor({
        name: message.author.username,
        iconURL: message.author.displayAvatarURL(),
      })
      .setDescription(`💬 ${text}`)
      .setFooter({
        text: `${sourceInfo.flag} Messaggio originale da ${channelName}`,
      });

    await globalChannel.send({ embeds: [embedOriginal] });
  }
});

// ================================
// 🔑  Login
// ================================
client.login(process.env.DISCORD_TOKEN);
