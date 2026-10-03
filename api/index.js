import { InteractionResponseType, InteractionType, verifyKey } from "discord-interactions";
import getRawBody from "raw-body";
import { DatabaseSync } from "node:sqlite";
import fetch from "node-fetch";
function insertShort(id, date, submitter, dbType = 0) {
    let db;
    if (dbType === 0) {
        db = new DatabaseSync("./dev.sqlite");
    }
    else if (dbType === 1) {
        db = new DatabaseSync("./prod.sqlite");
    }
    else {
        console.error("invalid dbType");
        return;
    }
    db.exec(`
        create table if not exists shorts (
                id text primary key, 
                date integer not null, 
                submitter text not null, 
                rates text not null    
        )`);
    const checkForDupeStmt = db.prepare(`SELECT * FROM shorts WHERE id = ?`);
    const exists = checkForDupeStmt.get(id);
    if (exists) {
        console.error("duplicate short");
        return;
    }
    const stmt = db.prepare(`INSERT INTO shorts (id, date, submitter, rates) 
        VALUES (?, ?, ?, ?)`);
    const result = stmt.run(id, date, submitter, JSON.stringify([]));
    if (db)
        db.close();
}
function readShort(id, dbType = 0) {
    let db;
    if (dbType === 0) {
        db = new DatabaseSync("./dev.sqlite");
    }
    else if (dbType === 1) {
        db = new DatabaseSync("./prod.sqlite");
    }
    else {
        console.error("invalid dbType");
        return;
    }
    const readStmt = db.prepare(`SELECT * FROM shorts WHERE id = ?`);
    const results = readStmt.get(id);
    if (db)
        db.close();
    return results;
}
function updateShort(id, dbType, ...rates) {
    let db;
    if (dbType === 0) {
        db = new DatabaseSync("./dev.sqlite");
    }
    else if (dbType === 1) {
        db = new DatabaseSync("./prod.sqlite");
    }
    else {
        console.error("invalid dbType");
        return;
    }
    const stmt = db.prepare(`UPDATE shorts
        SET rates = ?
        WHERE id = ?`);
    const existingData = readShort(id, dbType);
    if (!existingData) {
        console.error("no short to update");
        return;
    }
    const newData = JSON.parse(existingData.rates);
    newData.push(...rates);
    const result = stmt.run(JSON.stringify(newData), id);
    if (db)
        db.close();
}
export const INVITE_COMMAND = {
    name: "invite",
    description: "Get an invite link to add the bot to your server",
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
                        type: 4,
                        data: {
                            content: INVITE_URL,
                            flags: 64,
                        },
                    });
                    break;
                case SUBMIT_COMMAND.name.toLowerCase():
                    const user = message.member.user;
                    let url = message.data.options[0].value;
                    let errorText = "";
                    if (typeof url !== "string") {
                        errorText = "URL must be text";
                    }
                    else if (!url.match(/.+youtube\.com\/shorts\/.+/)) {
                        errorText = "URL must be a youtube shorts link";
                    }
                    else {
                        url = url.replace(/\?s.+$/, "");
                        url = url.replace(/\&.+$/, "");
                        response.status(200).send({
                            type: 4,
                            data: {
                                flags: 32768,
                                components: [
                                    {
                                        type: 10,
                                        content: `Submission by <@${user.id}>: ${url}`,
                                    },
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
                            },
                        });
                        break;
                    }
                    console.log(3);
                    response.status(200).send({
                        type: 4,
                        data: {
                            content: `Error submitting short: ${errorText}`,
                            flags: 64,
                        },
                    });
                    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
                    console.log("1");
                    wait(10 * 1000).then(async () => {
                        const replyResponse = await fetch(`https://discord.com/api/webhooks/${process.env.APPLICATION_ID}/${message.token}`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bot ${process.env.TOKEN}`,
                                "User-Agent": "GenericBot (https://github.com/discord/discord-example-app, 1.0.0)"
                            },
                            body: JSON.stringify({
                                content: `${url}`
                            })
                        });
                        console.log(replyResponse.text());
                    });
                    console.log("2");
                    break;
                default:
                    console.error("Unknown Command");
                    response.status(400).send({ error: "Unknown Type" });
                    break;
            }
        }
        else if (message.type === InteractionType.MESSAGE_COMPONENT) {
            const customId = message.data.custom_id;
            response.status(200).send({
                type: 4,
                data: {
                    content: `video embed for now this is just a placeholder: ${customId}`,
                    flags: 64,
                },
            });
        }
        else {
            console.error("Unknown Type");
            response.status(400).send({ error: "Unknown Type" });
        }
    }
};
