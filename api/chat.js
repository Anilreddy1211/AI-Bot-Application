// api/chat.js
import { MongoClient } from 'mongodb';
import { parse } from 'url';
import path from 'path';
import Busboy from 'busboy';
import pdfParse from 'pdf-parse';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'ai_support';
const COLLECTION_CONV = process.env.CONV_COLLECTION || 'conversations';
const COLLECTION_FAQ = process.env.FAQ_COLLECTION || 'faqs';

let cachedClient = null;
async function getMongo() {
  if (cachedClient && cachedClient.topology?.isConnected()) return cachedClient;
  cachedClient = new MongoClient(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await cachedClient.connect();
  return cachedClient;
}

function excerptMatch(text, q) {
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return null;
  const start = Math.max(0, idx - 120);
  const end = Math.min(text.length, idx + 240);
  return text.slice(start, end);
}

export default async function handler(req, res) {
  try {
    const { pathname } = parse(req.url);

    if (req.method === 'GET' && pathname === '/api/conversations') {
      const client = await getMongo();
      const db = client.db(DB_NAME);
      const conv = await db.collection(COLLECTION_CONV).findOne({}, { sort: { createdAt: -1 } });
      return res.status(200).json({ messages: (conv && conv.messages) || [] });
    }

    if (req.method === 'POST' && pathname === '/api/message') {
      const body = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
      });

      const { message } = body;
      if (!message) return res.status(400).json({ error: 'no message' });

      const client = await getMongo();
      const db = client.db(DB_NAME);
      let conv = await db.collection(COLLECTION_CONV).findOne({});
      if (!conv) { conv = { messages: [], createdAt: new Date() }; }
      conv.messages.push({ role: 'user', text: message.text, timestamp: new Date() });

      let botText = '';
      try {
        const faqs = await db.collection(COLLECTION_FAQ).find({}).toArray();
        const q = message.text.toLowerCase();
        let found = null;
        for (const f of faqs) {
          if (f.text && f.text.toLowerCase().includes(q)) {
            found = excerptMatch(f.text, q);
            break;
          }
        }
        if (found) {
          botText = found + "\n\n(Answer from uploaded docs)";
        } else {
          botText = "I couldn’t find this in the uploaded documents. Please upload relevant FAQs.";
        }
      } catch (e) {
        botText = "Sorry, I couldn’t search the documents. Please try again.";
      }

      conv.messages.push({ role: 'bot', text: botText, timestamp: new Date() });
      await db.collection(COLLECTION_CONV).updateOne({}, { $set: conv }, { upsert: true });

      return res.status(200).json({ role: 'bot', text: botText, timestamp: new Date() });
    }

    if (req.method === 'POST' && pathname === '/api/upload') {
      const busboy = new Busboy({ headers: req.headers });
      let fileBuffer = null;
      let filename = null;
      busboy.on('file', (fieldname, file, info) => {
        filename = info.filename;
        const buffers = [];
        file.on('data', (data) => buffers.push(data));
        file.on('end', () => {
          fileBuffer = Buffer.concat(buffers);
        });
      });
      busboy.on('finish', async () => {
        if (!fileBuffer) return res.status(400).json({ ok: false, msg: 'no file' });
        const ext = path.extname(filename).toLowerCase();
        let text = '';
        try {
          if (ext === '.pdf') {
            const parsed = await pdfParse(fileBuffer);
            text = parsed.text || '';
          } else {
            text = fileBuffer.toString('utf8');
          }
          const client = await getMongo();
          const db = client.db(DB_NAME);
          const faq = { filename, text, uploadedAt: new Date() };
          await db.collection(COLLECTION_FAQ).insertOne(faq);
          return res.status(200).json({ ok: true });
        } catch (err) {
          console.error('Upload parse error', err);
          return res.status(500).json({ ok: false, error: err.message });
        }
      });
      req.pipe(busboy);
      return;
    }

    return res.status(404).json({ error: 'not found' });
  } catch (err) {
    console.error('Server error', err);
    return res.status(500).json({ error: err.message });
  }
}
