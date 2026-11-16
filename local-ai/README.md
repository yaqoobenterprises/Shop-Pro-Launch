# Shop Pro Local AI Runtime

This is the first local-inference scaffold for the AI Accountant. It runs on the shop PC and
connects to Ollama on the same computer. It does **not** use a paid AI API, VPS, or cloud model.

## Requirements

- Python 3.11+
- Ollama installed locally
- A model downloaded in Ollama (the default is `qwen2.5:7b`; choose a smaller model if the PC has limited RAM)

## Start

1. Install Ollama and download a model:

   ```bash
   ollama pull qwen2.5:7b
   ```

2. Create a virtual environment and install this service:

   ```bash
   python -m venv .venv
   # Windows PowerShell:
   .venv\Scripts\Activate.ps1
   # macOS/Linux:
   source .venv/bin/activate
   pip install -r local-ai/requirements.txt
   ```

3. Start the local bridge:

   ```bash
   python local-ai/server.py
   ```

4. Check `http://127.0.0.1:8765/health`. A ready response means Ollama and the selected model are available.

## Configuration

- `OLLAMA_BASE_URL`: defaults to `http://127.0.0.1:11434`
- `OLLAMA_MODEL`: defaults to `qwen2.5:7b`
- `SHOP_PRO_AI_PORT`: defaults to `8765`
- `SHOP_PRO_AI_ALLOWED_ORIGINS`: comma-separated browser origins; defaults to the local Vite and Tauri origins

The server binds to `127.0.0.1` only. Do not change this to `0.0.0.0` or expose the port publicly.

## Security boundary

- This service has no Supabase URL, key, service-role key, or database connection.
- It accepts only user/assistant chat messages, not system prompts or executable tool calls.
- It cannot read or write Shop Pro records.
- The Shop Pro app must fetch verified, permission-scoped context through its existing services and send only the minimum necessary context to this local model.
- Transaction posting, editing, voiding, and restoring must remain in Shop Pro's existing permission-checked services with explicit user confirmation.
- Conversation persistence belongs in Shop Pro's authenticated storage layer, not this process. Restarting the PC must not erase chat history or business records.

This is an inference bridge scaffold, not a complete AI Accountant integration. The UI connection,
durable chat history, context retrieval, and controlled accounting actions are separate stages.
