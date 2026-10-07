import { InteractionResponseFlags, InteractionResponseType, InteractionType, verifyKey } from "discord-interactions";
import getRawBody from "raw-body";
import { setTimeout } from "node:timers/promises";
import { waitUntil } from "@vercel/functions";
import fetch from "node-fetch";
import { neon } from "@neondatabase/serverless";
const sql = neon(`${process.env.DATABASE_URL}`);
export const INVITE_COMMAND = {
    name: "invite",
    description: "Get an invite link to add the bot to your server",
};
export const GET_SHORTS_COMMAND = {
    name: "shorts",
    description: "Get the last 25 shorts submitted by someone, with a button to check ratings",
    options: [
        {
            name: "username",
            description: "The username of the submitter, leave blank to check for last 25 shorts submitted by anyone",
            type: 3,
            required: false
        }
    ]
};
export const SUBMIT_COMMAND = {
    name: "submit",
    description: "Submit a new short",
    options: [
        {
            name: "url",
            description: "The URL of the short to submit",
            type: 3,
            required: true
        }
    ]
};
const INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${process.env.APPLICATION_ID}&scope=applications.commands`;
export default async (request, response) => {
    if (request.method === "POST") {
        const signature = request.headers["x-signature-ed25519"];
        const timestamp = request.headers["x-signature-timestamp"];
        const rawBody = await getRawBody(request);
        const isValidRequest = verifyKey(rawBody, signature, timestamp, process.env.PUBLIC_KEY);
        if (!isValidRequest) {
            console.error("Invalid Request");
            return response.status(401).send({ error: "Bad request signature " });
        }
        const message = request.body;
        if (message.type === InteractionType.PING) {
            console.log("Handling Ping request");
            response.send({
                type: InteractionResponseType.PONG,
            });
        }
        else if (message.type === InteractionType.APPLICATION_COMMAND) {
            switch (message.data.name.toLowerCase()) {
                case INVITE_COMMAND.name.toLowerCase():
                    response.status(200).send({
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: {
                            content: INVITE_URL,
                            flags: InteractionResponseFlags.EPHEMERAL,
                        },
                    });
                    break;
                case GET_SHORTS_COMMAND.name.toLowerCase():
                    const results = await sql `SELECT * FROM shorts`;
                    response.status(200).send({
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: {
                            content: JSON.stringify(results),
                            flags: InteractionResponseFlags.EPHEMERAL,
                        },
                    });
                    break;
                case SUBMIT_COMMAND.name.toLowerCase():
                    const user = message.member.user;
                    let url = message.data.options[0].value;
                    let errorText = "";
                    if (message.channel.name !== "bot-test" && message.channel.name !== "the-shorts-dump") {
                        errorText = `Shorts Bot can only be used in [\# the-shorts-dump](https://discord.com/channels/1530650371981054112/1550699488052645908)`;
                    }
                    else if (typeof url !== "string") {
                        errorText = "URL must be text";
                    }
                    else if (!url.match(/.+youtube\.com\/shorts\/.+/)) {
                        errorText = "URL must be a youtube shorts link";
                    }
                    else {
                        url = url.replace(/\?s.+$/, "");
                        url = url.replace(/\&.+$/, "");
                        const id = url.match(/(?<=shorts\/).+/)[0];
                        const dupeURL = await sql `SELECT messageurl FROM shorts WHERE id = ${id}`;
                        if (dupeURL.length === 0) {
                            waitUntil(setTimeout(3000).then(async () => {
                                const sentMessage = await fetch(`https://discord.com/api/webhooks/${process.env.APPLICATION_ID}/${message.token}/messages/@original`);
                                const messageId = (await sentMessage.json()).id;
                                const messageURL = `${message.guild_id}/${message.channel_id}/${messageId}`;
                                await sql `INSERT INTO shorts(id, timestamp, submitter, messageURL) VALUES (${id}, NOW(), ${user.username}, ${messageURL});`;
                                await fetch(`https://discord.com/api/webhooks/${process.env.APPLICATION_ID}/${message.token}?with_components=true`, {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                        "Authorization": `Bot ${process.env.TOKEN}`,
                                        "User-Agent": "GenericBot (https://github.com/discord/discord-example-app, 1.0.0)"
                                    },
                                    body: JSON.stringify({
                                        flags: 32768,
                                        components: [
                                            {
                                                type: 1,
                                                components: [
                                                    {
                                                        type: 2,
                                                        style: 1,
                                                        label: "Rate!",
                                                        custom_id: `rate_${url}`,
                                                    }
                                                ]
                                            }
                                        ]
                                    })
                                });
                            }));
                            response.status(200).send({
                                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                                data: {
                                    content: `Submission by <@${user.id}>: ${url}`
                                },
                            });
                            break;
                        }
                        errorText = `Short is a duplicate of https://discord.com/channels/${dupeURL[0]}`;
                    }
                    response.status(200).send({
                        type: 4,
                        data: {
                            content: `Error submitting short: ${errorText}`,
                            flags: 64,
                        },
                    });
                    break;
                default:
                    console.error("Unknown Command");
                    response.status(400).send({ error: "Unknown Type" });
                    break;
            }
        }
        else if (message.type === InteractionType.MESSAGE_COMPONENT) {
            const customId = message.data.custom_id;
            if (customId.startsWith("rate_")) {
                response.status(200).send({
                    type: 9,
                    data: {
                        custom_id: "rate_modal",
                        title: "Rate this short!",
                        components: [
                            {
                                type: 18,
                                label: "Rating (out of 100)",
                                component: {
                                    type: 4,
                                    style: 1,
                                    custom_id: "rating",
                                    placeholder: "integer between 0 and 100"
                                }
                            },
                            {
                                type: 18,
                                label: "Notes",
                                component: {
                                    type: 4,
                                    style: 2,
                                    custom_id: "notes",
                                    required: false,
                                    placeholder: "text has to be less than 4000 characters"
                                }
                            },
                        ]
                    },
                });
            }
        }
        else if (message.type === 5) {
            const customId = message.data.custom_id;
            if (customId.startsWith("rate_")) {
                const components = message.data.components;
                const rating = parseInt(components[0].component.value);
                const notes = components[1].component.value;
                if (rating >= 0 && rating <= 100) {
                    response.status(200).send({
                        type: 4,
                        data: {
                            content: `Thanks for rating this short!\nYour rating was: ${rating} out of 100` + (notes ? `, with notes "${notes}"` : ""),
                            flags: 64
                        },
                    });
                }
                response.status(200).send({
                    type: 4,
                    data: {
                        content: "Invalid rating, please resubmit",
                        flags: 64
                    }
                });
            }
        }
        else {
            console.error("Unknown Type");
            response.status(400).send({ error: "Unknown Type" });
        }
    }
};
