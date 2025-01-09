<p align="center">
  <img src="./static/favicon.png" width="150" title="ChopChopSplit">
</p>
<h1 align="center">ChopChopSplit</h1>

<p align="center">
  A Telegram bot powered by AI to split bills and track group expenses intelligently.
</p>

<p align="center">
  <a href="https://t.me/ChopChopSplit_bot">@ChopChopSplit_bot</a> on Telegram
</p>

## ✨ Features

### 📸 Smart Receipt Processing
- Snap a receipt photo in any Telegram group
- AI automatically extracts:
  - Individual items with quantities and prices
  - Service charges and taxes
  - Store details and date
- Intelligent distribution of service charges and taxes

### 💰 Split Options
- Equal splitting
- Unequal amounts
- Percentage-based
- Share-based
- Item-based assignment

### 🌐 Additional Features
- Multi-language support (English, Italian)
- Real-time debt tracking
- Interactive UI for item assignment
- Group expense history
- Secure Telegram login

## 🚀 Getting Started

1. Add [@ChopChopSplit_bot](https://t.me/ChopChopSplit_bot) to your Telegram group
2. Wait for all group members to join
3. Use /app command to launch the webapp and manage expenses
4. Or simply send a receipt photo to get started

## 🛠️ Self Hosting

### Prerequisites
- Node.js
- MongoDB
- Telegram Bot Token
- Google Gemini API Key

### Required MongoDB Collections
- users
- groups
- splits
- payments

### Environment Setup
Create a `.env` file with:
  ```bash
  TELEGRAM_BOT_TOKEN=your_bot_token
  MONGODB_URI=your_mongodb_uri
  GEMINI_API_KEY=your_gemini_api_key
  BASE_HOST=your_base_url
  APP_PORT=your_app_port
  ```


### Installation

1. Install dependencies:
  ```bash
  npm install
  ```

2. Run with Docker:
  ```bash
  docker compose up -d
  ```

3. Or run locally:
  ```bash
  npm run dev
  ```


## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests

## 🛠️ Tech Stack
- Frontend: SvelteKit, TypeScript, TailwindCSS
- Backend: Node.js, MongoDB
- AI: Google Gemini API
- Integration: Telegram Bot & Web App APIs
- Deployment: Docker

## 📝 License

This project is licensed under the MIT License.

## 📧 Contact

For support or inquiries:
- Create an issue on GitHub
- Contact via Telegram: [@dhirennn]
