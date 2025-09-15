# AI Customer Support Chat Platform (No LLM version)

This version works **without OpenAI or Anthropic API keys**.

- Upload FAQ documents (PDF/TXT) via the Admin page.
- Chatbot searches uploaded documents for answers.
- If nothing found, it replies with a default fallback message.
- No external LLM APIs required.

Deploy to Vercel and set only:
- `mongodb+srv://atlas_user:Anil_1211@cluster0.fhzodhz.mongodb.net/ai_support?retryWrites=true&w=majority` (from MongoDB Atlas)
- `ai_support` (optional, default: ai_support)
- `VITE_API_BASE` (frontend → backend URL)
"# AI-chat-application" 
"# AI-Bot-Application" 
