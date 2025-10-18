// ================================
// 🌍 Bot Traduttore Multicanale — versione FIX + Comandi Slash
// ================================

import dotenv from "dotenv";
import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes } from "discord.js";
import express from "express";

// ================================
// 🌐 Server HTTP per Render
// ================================
const app = express();
app.get("/", (_req, res) => res.send("✅ Traduttore Bot attivo e in ascolto!"));
const port = process.env.PORT || 10000;
app.listen(port, "0.0.0.0", () => {
  console.log(`🌐 Server HTTP attivo su 0.0.0.0:${port}`);
});

// ================================
// ⚙️ Configurazione Discord
// ================================
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// 🧱 Blocca avvii multipli accidentalmente
if (globalThis.traduttoreRunning) {
  console.log("⛔ Istanza duplicata rilevata, uscita.");
  process.exit(0);
} else {
  globalThis.traduttoreRunning = true;
}

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

client.once("clientReady", async () => {
  console.log(`✅ Traduttore ${client.user.tag} è online.`);

  // ================================
  // 🧩 Registrazione comandi slash
  // ================================
  const commands = [
    {
      name: "ping",
      description: "Mostra la latenza del bot",
    },
    {
      name: "status",
      description: "Mostra lo stato attuale del bot traduttore",
    },
  ];

  try {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Comandi slash /ping e /status registrati globalmente.");
  } catch (err) {
    console.error("❌ Errore registrando i comandi slash:", err);
  }
});

// ================================
// 🔧 Funzione di traduzione migliorata
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
    console.error(`❌ Errore API di traduzione (${from}→${to}):`, err.message);
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
    if (footerText.includes("tradotto") || footerText.includes("messaggio originale")) return;

    const channelName = message.channel.name.toLowerCase();
    const sourceInfo =
      channelName === globalChannelName ? null : channelLanguages[channelName];
    const globalChannel = message.guild.channels.cache.find(
      (c) => c.name.toLowerCase() === globalChannelName
    );

    console.log(`📨 ${message.author.username} -> #${channelName}: ${text}`);

   // 🔹 Caso 1 — messaggio nel canale globale
if (channelName === globalChannelName) {
  // Estraiamo la lingua originale se presente nell'embed (es. 🇮🇹 Messaggio originale da ...)
  const flagMatch = message.embeds?.[0]?.footer?.text?.match(/([🇦-🏴])/u);
  const originalLang = flagMatch
    ? Object.values(channelLanguages).find((v) => v.flag === flagMatch[1])
    : null;

  for (const [targetName, targetInfo] of Object.entries(channelLanguages)) {
    // ❌ Se la lingua target coincide con quella originale, salta (evita doppio invio)
    if (originalLang && targetInfo.code === originalLang.code) continue;

    const targetChannel = message.guild.channels.cache.find(
      (c) => c.name.toLowerCase() === targetName
    );
    if (!targetChannel) continue;

    const tradotto = await translateText(text, "auto", targetInfo.code);
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
  return;
}

    // 🔹 Caso 2 — messaggio in canale lingua specifica
    if (!sourceInfo) return;

    for (const [targetName, targetInfo] of Object.entries(channelLanguages)) {
      if (targetName === channelName || targetInfo.code === sourceInfo.code) continue;

      const targetChannel = message.guild.channels.cache.find(
        (c) => c.name.toLowerCase() === targetName
      );
      if (!targetChannel) continue;

      const tradotto = await translateText(text, sourceInfo.code, targetInfo.code);
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

    // 🔹 Invia il messaggio originale al canale globale
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
  } catch (err) {
    console.error(`💥 Errore handler messageCreate:`, err);
  }
});

// ================================
// 💬 Gestione dei comandi slash
// ================================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  if (commandName === "ping") {
    const latency = Date.now() - interaction.createdTimestamp;
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2ecc71)
          .setDescription(`🏓 Pong! Latenza: **${latency} ms**`),
      ],
      ephemeral: true,
    });
  }

  if (commandName === "status") {
    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("🤖 Stato del Traduttore Bot")
      .setDescription(
        `🟢 Online come **${client.user.tag}**\n📡 Guilds: **${client.guilds.cache.size}**\n✅ Traduzione automatica attiva`
      )
      .setTimestamp()
      .setFooter({ text: "System check completato" });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

// ================================
// 🔑 Login
// ================================
client.login(process.env.DISCORD_TOKEN);
