// ================================
// 🌍  Bot Traduttore Multicanale
// ================================

import dotenv from "dotenv";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import googleTranslate from "@vitalets/google-translate-api";
import express from "express";

// ================================
// 🌐  Server HTTP per Render
// ================================
const app = express();

app.get("/", (req, res) => {
  res.send("✅ Traduttore Bot attivo e in ascolto!");
});

// Usa la porta assegnata da Render (default 10000)
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

client.once("clientReady", () => {
  console.log(`✅ Traduttore ${client.user.tag} è online con messaggi embed.`);
});

// ================================
// 🗣️  Gestione dei messaggi
// ================================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const channelName = message.channel.name.toLowerCase();
  const text = message.content.trim();
  if (!text) return;

  // 🔹 Caso 1: canale globale → traduci verso tutti gli altri
  if (channelName === globalChannelName) {
    for (const [targetName, targetInfo] of Object.entries(channelLanguages)) {
      const targetChannel = message.guild.channels.cache.find(
        (ch) => ch.name.toLowerCase() === targetName
      );
      if (!targetChannel) continue;

      try {
        // ✅ Usa googleTranslate (nuova libreria)
        const result = await googleTranslate(text, { to: targetInfo.code });
        const tradotto = result.text ?? "⚠️ Nessuna traduzione trovata.";

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
      } catch (err) {
        console.error(`❌ Errore traduzione per ${targetInfo.code}:`, err.message);
      }
    }
    return;
  }

  // 🔹 Caso 2: messaggio in un canale di lingua specifica
  const sourceInfo = channelLanguages[channelName];
  if (!sourceInfo) return;

  for (const [targetName, targetInfo] of Object.entries(channelLanguages)) {
    // salta stesso canale o stessa lingua
    if (targetName === channelName || targetInfo.code === sourceInfo.code) continue;

    const targetChannel = message.guild.channels.cache.find(
      (ch) => ch.name.toLowerCase() === targetName
    );
    if (!targetChannel) continue;

    try {
      // ✅ Usa googleTranslate con specifica lingua di partenza
      const result = await googleTranslate(text, {
        from: sourceInfo.code,
        to: targetInfo.code,
      });
      const tradotto = result.text ?? "⚠️ Nessuna traduzione trovata.";

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
    } catch (err) {
      console.error(`❌ Errore traduzione ${sourceInfo.code}→${targetInfo.code}:`, err.message);
    }
  }

  // 🔹 Invia il testo originale nel canale globale (senza traduzione)
  const globalChannel = message.guild.channels.cache.find(
    (ch) => ch.name.toLowerCase() === globalChannelName
  );
  if (globalChannel) {
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
