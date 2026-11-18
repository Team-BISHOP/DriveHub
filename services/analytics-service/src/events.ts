import amqp from "amqplib";

const EXCHANGE = "drivehub.events";
let channel: amqp.Channel;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function connectBroker(url: string, retries = 30): Promise<void> {
    for (let i = 1; i <= retries; i++) {
        try {
            const conn = await amqp.connect(url);
            channel = await conn.createChannel();
            await channel.assertExchange(EXCHANGE, "topic", { durable: true });
            return;
        } catch {
            console.log(`Waiting for RabbitMQ (${i}/${retries})...`);
            await sleep(2000);
        }
    }
    throw new Error("RabbitMQ not reachable");
}

export async function subscribe(
    queue: string,
    routingKeys: string[],
    handler: (routingKey: string, payload: any) => Promise<void>
): Promise<void> {
    await channel.assertQueue(queue, { durable: true });
    for (const key of routingKeys) await channel.bindQueue(queue, EXCHANGE, key);
    await channel.prefetch(10);
    await channel.consume(queue, async (msg) => {
        if (!msg) return;
        const key = msg.fields.routingKey;
        try {
            const payload = JSON.parse(msg.content.toString());
            console.log(`[analytics event in] ${key}`, payload);
            await handler(key, payload);
            channel.ack(msg);
        } catch (err) {
            console.error(`Failed to handle ${key} in analytics:`, err);
            channel.nack(msg, false, false);
        }
    });
}
