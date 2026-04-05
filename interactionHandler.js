const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const { runManualCount } = require('./systems/CountCase.js');
const { updateConfigInSheets } = require('./configManager.js');

function createStatusEmbed(conf) {
    return new EmbedBuilder()
        .setTitle('⚠️ สถานะปัจจุบัน (การตั้งค่า):')
        .setDescription(`**Sheet ID:** \`${conf.SPREADSHEET_ID}\`\n**Sheet Name:** \`${conf.SHEET_NAME}\`\n\n**Channel ที่นับ:**\n• # เทค2: <#${conf.CHANNELS.TECH2}>\n• # คดีปกติ: <#${conf.CHANNELS.KADEE}>\n• # รถยอด: <#${conf.CHANNELS.CAR}>\n• # คุมสอบ: <#${conf.CHANNELS.EXAM}>`)
        .setColor('#f1c40f')
        .setFooter({ text: 'ดึงข้อมูลการตั้งค่าจาก Google Sheets เรียบร้อย' });
}

function handleInteractions(client, config) {
    // จัดการคำสั่ง !setup
    client.on('messageCreate', async (message) => {
        if (message.guild && message.content === '!setup' && message.member?.permissions?.has('Administrator')) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('start_recount').setLabel('⭐ เริ่มนับข้อความเก่า').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('open_settings').setLabel('⚙️ ตั้งค่า').setStyle(ButtonStyle.Success)
            );
            await message.channel.send({ embeds: [createStatusEmbed(config)], components: [row] });
        }
    });

    // จัดการ Buttons และ Modals
    client.on('interactionCreate', async (interaction) => {
        if (interaction.isButton()) {
            if (interaction.customId === 'start_recount') {
                try {
                    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
                    await runManualCount(interaction, config);
                } catch (e) { console.error(e); }
            }

            if (interaction.customId === 'open_settings') {
                const modal = new ModalBuilder().setCustomId('settings_modal').setTitle('ตั้งค่าบอท');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('m_sheet_id').setLabel('Spreadsheet ID').setValue(config.SPREADSHEET_ID || "").setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('m_sheet_name').setLabel('ชื่อชีต (Sheet Name)').setValue(config.SHEET_NAME || "").setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('m_channels').setLabel('Channel IDs (คั่นด้วย , ) 4 ช่อง').setValue(`${config.CHANNELS.TECH2 || ""}, ${config.CHANNELS.KADEE || ""}, ${config.CHANNELS.CAR || ""}, ${config.CHANNELS.EXAM || ""}`).setStyle(TextInputStyle.Paragraph).setRequired(true))
                );
                await interaction.showModal(modal);
            }
        }

        if (interaction.isModalSubmit() && interaction.customId === 'settings_modal') {
            await interaction.deferUpdate();
            const newIds = interaction.fields.getTextInputValue('m_channels').split(',').map(id => id.trim());
            config.SPREADSHEET_ID = interaction.fields.getTextInputValue('m_sheet_id');
            config.SHEET_NAME = interaction.fields.getTextInputValue('m_sheet_name');
            config.CHANNELS = { "TECH2": newIds[0], "KADEE": newIds[1], "CAR": newIds[2], "EXAM": newIds[3] };

            await updateConfigInSheets(config);
            await interaction.editReply({ embeds: [createStatusEmbed(config)], components: [interaction.message.components[0]] });
        }
    });
}

module.exports = { handleInteractions };