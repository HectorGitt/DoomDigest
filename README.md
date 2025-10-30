# DoomDigest

AI-powered Chrome extension for automatic article summarization, productivity analytics, and content management using Chrome's built-in AI APIs and Google Drive integration.

## ✨ Features

### 🤖 AI-Powered Summarization

-   **Smart Content Detection**: Automatically detects articles vs. social media feeds
-   **Multiple AI Providers**: Choose between Chrome's built-in AI or Google Gemini API
-   **Summary Types**: Key-points, headlines, teasers, and custom formats
-   **Real-time Processing**: Instant summarization as you browse

### 📊 Productivity Analytics

-   **Comprehensive Reports**: Reading habits, content quality assessment, productivity insights
-   **Time-based Analysis**: Daily, weekly, monthly, quarterly, and custom date ranges
-   **Auto-generated Reports**: Scheduled analytics generation with customizable frequency
-   **Advanced Customization**: Focus areas, analysis depth, output formats, and custom instructions

### ☁️ Cloud Integration

-   **Google Drive Sync**: Automatic backup and sync of summaries and analytics
-   **OAuth Authentication**: Secure connection to Google Drive
-   **Folder Management**: Organized storage with automatic folder creation
-   **Cross-device Access**: Access your data from any device

### 🎯 Smart Features

-   **Auto-Snap**: Automatic summarization based on content length and time intervals
-   **Content Deduplication**: Intelligent detection of already-processed content
-   **Theme Adaptation**: Automatically adapts to website color schemes (dark/light themes)
-   **State Preservation**: Loading states persist across page refreshes

### 💾 Advanced Storage

-   **IndexedDB Storage**: Local storage for summaries and analytics (no external dependencies)
-   **Persistent Settings**: All preferences and configurations saved locally
-   **Export Options**: TXT, Markdown, JSON, and HTML export formats
-   **Clipboard Integration**: One-click copying of summaries and reports

### 🎨 User Experience

-   **Modern UI**: Clean, responsive interface with Material Design icons
-   **Navigation System**: Seamless navigation between Digest, Analytics, and Settings
-   **Loading States**: Visual feedback for all operations
-   **Toast Notifications**: Real-time status updates and error handling

## 🚀 Installation

### For Users

1. **Download the Extension**

    - Visit the [Chrome Web Store](https://chrome.google.com/webstore) (coming soon)
    - Or download from [GitHub Releases](https://github.com/HectorGitt/DoomDigest/releases)

2. **Install in Chrome**

    - Open Chrome and navigate to `chrome://extensions/`
    - Enable "Developer mode" in the top right corner
    - Click "Load unpacked" and select the extension folder
    - The DoomDigest extension will appear in your extensions list

3. **First Time Setup**
    - Click the extension icon in the toolbar
    - Choose your preferred AI provider (Chrome AI or Google Gemini)
    - Configure auto-snap settings and notification preferences

### For Developers

1. **Clone the Repository**

    ```bash
    git clone https://github.com/HectorGitt/DoomDigest.git
    cd DoomDigest
    ```

2. **Install Dependencies**

    ```bash
    npm install
    ```

3. **Build the Extension**

    ```bash
    npm run build
    ```

4. **Load in Chrome**
    - Open `chrome://extensions/`
    - Enable "Developer mode"
    - Click "Load unpacked" and select the `dist/` folder

## 📖 How to Use

### Basic Summarization

1. **Open Any Webpage**

    - Navigate to an article, blog post, or content-rich page

2. **Open DoomDigest Sidebar**

    - Click the DoomDigest icon in the Chrome toolbar
    - Or use the keyboard shortcut (configurable in settings)

3. **Start Summarization**

    - Click "Start PagePulse" to begin automatic content detection
    - Watch as summaries appear in real-time, grouped by website

4. **Interact with Summaries**
    - Click any summary to jump to the original content
    - Use "Stop All" to halt processing
    - Toggle "Auto Snap" for automatic summarization

### Advanced Features

#### Analytics Dashboard

-   Navigate to Analytics from the top navigation
-   Configure time periods, analysis depth, and focus areas
-   Generate comprehensive productivity reports
-   View auto-saved historical reports

#### Google Drive Integration

-   Go to Settings and connect your Google Drive
-   Enable auto-sync for automatic backups
-   Configure sync frequency and folder organization

#### Export & Sharing

-   Export summaries in multiple formats (TXT, MD, JSON)
-   Copy reports to clipboard for sharing
-   Sync analytics reports to Google Drive

### Settings Configuration

#### AI Provider Setup

-   **Chrome AI**: Built-in, no configuration required
-   **Google Gemini**: Requires API key from Google AI Studio
    -   Get your API key at [Google AI Studio](https://makersuite.google.com/app/apikey)
    -   Paste the key in Settings > API Configuration

#### Auto-Snap Configuration

-   Set content length thresholds for automatic summarization
-   Configure time intervals between auto-summaries
-   Enable/disable notifications

#### Analytics Preferences

-   Set auto-run frequency (daily, weekly, monthly)
-   Configure analysis depth and focus areas
-   Customize output formats and instructions

## 🏗️ Architecture

### Core Components

#### Background Script (`background.js`)

-   Manages extension lifecycle and tab events
-   Coordinates communication between all components
-   Handles Google Drive authentication and sync
-   Manages alarms for auto-run analytics

#### Content Script (`content.js`)

-   Detects and extracts readable content from web pages
-   Performs AI summarization using configured providers
-   Manages content deduplication and hashing
-   Handles auto-snap functionality

#### Sidebar (`sidebar.js`, `sidebar.html`, `sidebar.css`)

-   Main user interface for summarization controls
-   Displays summaries grouped by website and date
-   Adapts to website themes automatically
-   Manages generation state and user interactions

#### Analytics (`analytics.js`, `analytics.html`)

-   Comprehensive analytics dashboard
-   Auto-generates productivity reports
-   Manages report storage and export
-   Provides historical analytics viewing

#### Settings (`settings.js`, `settings.html`)

-   Complete configuration interface
-   API provider management
-   Google Drive integration setup
-   Auto-run and notification preferences

### Data Storage

#### IndexedDB Databases

-   **DoomDigestDB**: Summaries storage with timestamp and URL indexing
-   **DoomDigestAnalyticsDB**: Analytics reports with generation date indexing

#### Chrome Storage

-   **chrome.storage.sync**: User preferences and settings
-   **chrome.storage.local**: Temporary states and loading indicators

## 🔧 Development

### Project Structure

```
src/
├── background.js          # Extension background script
├── content.js             # Content script for summarization
├── sidebar.js             # Sidebar UI and controls
├── sidebar.html           # Sidebar HTML template
├── sidebar.css            # Sidebar styling
├── analytics.js           # Analytics dashboard logic
├── analytics.html         # Analytics page template
├── settings.js            # Settings page logic
├── settings.html          # Settings page template
├── navigation.js          # Shared navigation component
├── manifest.json          # Extension manifest
├── icon.png              # Extension icon
└── toast.js              # Toast notification system

dist/                     # Built extension (generated)
├── background.js
├── content.js
├── sidebar.js
├── manifest.json
└── [other assets]
```

### Build System

-   **Rollup**: Module bundling and optimization
-   **ES6 Modules**: Modern JavaScript with tree-shaking
-   **Source Maps**: Debugging support in development

### Available Scripts

```bash
npm run build    # Build for production
npm run clean    # Clean dist directory
npm start        # Alias for build
```

## ⚙️ Configuration

### Chrome AI Setup

1. Ensure Chrome version 116+
2. Visit `chrome://flags/`
3. Enable "Experimental Web Platform features"
4. Enable "Prompt API for Gemini Nano"
5. Restart Chrome

### Google Gemini Setup

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Copy the key to Settings > API Configuration
4. Test the connection

### Google Drive Setup

1. Go to Settings > Google Drive
2. Click "Connect Google Drive"
3. Authorize the extension
4. Configure sync preferences

## 🔒 Privacy & Security

-   **Local Processing**: All AI operations happen in your browser
-   **No Data Transmission**: Content never leaves your device (except for Google Drive sync when enabled)
-   **Secure Storage**: Sensitive data encrypted and stored locally
-   **OAuth Integration**: Secure Google Drive authentication
-   **Content Hashing**: Privacy-preserving duplicate detection

## 🐛 Troubleshooting

### Common Issues

#### Extension Not Loading

-   Check Chrome version (116+ required)
-   Verify AI features are enabled in `chrome://flags/`
-   Try reloading the extension
-   Check browser console for errors

#### Summarization Not Working

-   Ensure webpage has substantial text content
-   Check if content was already processed
-   Verify AI provider is configured correctly
-   Try switching between Chrome AI and Gemini

#### Google Drive Sync Issues

-   Re-authorize Google Drive connection
-   Check internet connectivity
-   Verify Google Drive API permissions
-   Check browser console for authentication errors

#### Theme Not Adapting

-   Some websites have complex CSS
-   Extension falls back to light theme
-   Manual refresh may help

### Debug Mode

-   Open Chrome DevTools on extension pages
-   Check Console tab for error messages
-   Use Application tab to inspect storage
-   Enable verbose logging in settings

## 🤝 Contributing

1. **Fork the Repository**

    ```bash
    git clone https://github.com/HectorGitt/DoomDigest.git
    cd DoomDigest
    ```

2. **Create Feature Branch**

    ```bash
    git checkout -b feature/your-feature-name
    ```

3. **Make Changes**

    - Follow ES6+ standards
    - Test thoroughly on multiple websites
    - Ensure responsive design
    - Maintain accessibility

4. **Build and Test**

    ```bash
    npm run build
    # Load dist/ folder in Chrome extensions
    ```

5. **Submit Pull Request**
    - Write clear commit messages
    - Include screenshots for UI changes
    - Update documentation if needed

### Development Guidelines

-   Use async/await for asynchronous operations
-   Follow Chrome extension best practices
-   Maintain consistent code style
-   Add JSDoc comments for functions
-   Test on multiple browsers when possible

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 🙏 Acknowledgments

-   Built using Chrome's AI APIs and Google Generative AI
-   Material Design Icons for consistent UI
-   Chrome Extensions community for inspiration
-   Contributors and beta testers

## 📞 Support

-   **Bug Reports**: [GitHub Issues](https://github.com/HectorGitt/DoomDigest/issues)
-   **Feature Requests**: [GitHub Discussions](https://github.com/HectorGitt/DoomDigest/discussions)
-   **User Reviews**: [Chrome Web Store](https://chrome.google.com/webstore) (coming soon)
-   **Documentation**: This README and inline code comments

---

**DoomDigest** - Transform your reading experience with AI-powered content summarization and productivity analytics.</content>
