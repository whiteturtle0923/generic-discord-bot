import { InteractionResponseType, InteractionType, verifyKey } from "discord-interactions";
import getRawBody from "raw-body";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
 console.log(fs.readdirSync("./"))

function insertShort(id, date, submitter, dbType = 0) {
    let db;
    if (dbType === 0) {
        db = new DatabaseSync("./dev.sqlite");
    }
    else if (dbType === 1) {
        db = new DatabaseSync("./prod.sqlite");
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
    const stmt = db.prepare(
        `INSERT INTO shorts (id, date, submitter, rates) 
        VALUES (?, ?, ?, ?)`
    );
    const result = stmt.run(id, date, submitter, JSON.stringify([]));
    //console.log(result);
    if (db) db.close();
}

function readShort(id, dbType = 0) {
    let db;
    if (dbType === 0) {
        db = new DatabaseSync("./dev.sqlite");
    }
    else if (dbType === 1) {
        db = new DatabaseSync("./prod.sqlite");
    }
    const readStmt = db.prepare(`SELECT * FROM shorts WHERE id = ?`);
    const results = readStmt.get(id);
    if (db) db.close();
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
    const stmt = db.prepare(
        `UPDATE shorts
        SET rates = ?
        WHERE id = ?`
    );
    const existingData = readShort(id, dbType);
    if (!existingData) {
        console.error("no short to update");
        return;
    }
    const newData = JSON.parse(existingData.rates);
    newData.push(...rates);
    //console.log(newData);
    const result = stmt.run(JSON.stringify(newData), id);
    //console.log(result);
    if (db) db.close();
}

// name: string, rate: integer 0-100, notes: string, date: integer
const rateData = {name: "whiteturtle0923", rate: 75, notes: "test", date: Date.now()};

//insertShort("id", Date.now(), "blackturtle3290");
//console.log(readShort("id"));
//updateShort("id", 0, {name: "awlsonfeather", rate: 84, notes: "idk i liked it", date: Date.now()}, {name: "whalesrock", rate: 12, notes: "ts pmo", date: Date.now()});
//console.log(readShort("id"));


 
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
            type: 3, // STRING
            required: true
        }
    ]
};
 
const INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${process.env.APPLICATION_ID}&scope=applications.commands`;
 
/**
 * @param {VercelRequest} request
 * @param {VercelResponse} response
 */
export default async (request, response) => {
	// Only respond to POST requests
	if (request.method === "POST") {
		// Verify the request
		const signature = request.headers["x-signature-ed25519"];
		const timestamp = request.headers["x-signature-timestamp"];
		const rawBody = await getRawBody(request);
 
		const isValidRequest = verifyKey(rawBody, signature, timestamp, process.env.PUBLIC_KEY);
 
		if (!isValidRequest) {
			console.error("Invalid Request");
			return response.status(401).send({ error: "Bad request signature " });
		}
 
		// Handle the request
		const message = request.body;
 
		// Handle PINGs from Discord
		if (message.type === InteractionType.PING) {
			console.log("Handling Ping request");
			response.send({
				type: InteractionResponseType.PONG,
			});
		} 
        else if (message.type === InteractionType.APPLICATION_COMMAND) {
			// Handle our Slash Commands
			switch (message.data.name.toLowerCase()) {
				case INVITE_COMMAND.name.toLowerCase():
					response.status(200).send({
						type: 4,
						data: {
							content: INVITE_URL,
							flags: 64,
						},
					});
					console.log("Invite request");
					break;
				case SUBMIT_COMMAND.name.toLowerCase():
                    /*const user = message.member.user;
                    const url = message.data.options[0].value;
                    insertShort(url, Date.now(), userId, 1);
                    console.log(`New short submitted by <@${userId}>: ${url}`);*/
					response.status(200).send({
						type: 4,
						data: {
							content: "Please submit your short using the form.",
							flags: 64,
						},
					});
					console.log("Submit request");
					break;
				default:
					console.error("Unknown Command");
					response.status(400).send({ error: "Unknown Type" });
					break;
			}
		} else {
			console.error("Unknown Type");
			response.status(400).send({ error: "Unknown Type" });
		}
	}
};