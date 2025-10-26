# DoomDigest

AI-powered Chrome extension for automatic article summarization using Chrome's built-in AI APIs.

## Features

-   **Smart Content Detection**: Automatically detects articles vs. social media feeds
-   **AI-Powered Summarization**: Uses Chrome's Summarizer API for intelligent content summarization
-   **Multiple Summary Types**: Choose from key-points, headlines, or teasers
-   **Clickable Summaries**: Click summaries to jump to the original content
-   **Theme Adaptation**: Automatically adapts to website color schemes (dark/light themes)
-   **Generation Controls**: Start, stop, and manage summarization processes
-   **Persistent Storage**: Remembers processed content and settings across sessions

## Installation

### For Users

1. Download the latest release from the [Releases](https://github.com/HectorGitt/DoomDigest/releases) page
2. Unzip the downloaded file
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" in the top right
5. Click "Load unpacked" and select the unzipped folder
6. The extension will appear in your extensions list and sidebar

### For Developers

1. Clone the repository:

    ```bash
    git clone https://github.com/HectorGitt/DoomDigest.git
    cd DoomDigest
    ```

2. Install dependencies:

    ```bash
    npm install
    ```

3. Build the extension:

    ```bash
    npm run build
    ```

4. Load the extension in Chrome:
    - Open `chrome://extensions/`
    - Enable "Developer mode"
    - Click "Load unpacked" and select the `dist/` folder

## Development

### Available Scripts

-   `npm run build` - Build the extension for production
-   `npm run clean` - Clean the dist directory
-   `npm start` - Alias for build

### Project Structure

```
src/
├── background.js    # Extension background script (tab management)
├── content.js       # Content script (article detection & summarization)
├── sidebar.js       # Sidebar UI and controls
├── sidebar.html     # Sidebar HTML template
├── sidebar.css      # Sidebar styling
└── manifest.json    # Extension manifest

dist/                # Built extension (generated)
rollup.config.js     # Build configuration
package.json         # NPM configuration
```

### Building

The project uses Rollup to bundle the JavaScript modules. The build process:

1. Bundles the three entry points (`background.js`, `content.js`, `sidebar.js`)
2. Copies static assets (`manifest.json`, `sidebar.html`, `sidebar.css`)
3. Generates source maps for debugging

## Usage

1. **Open a webpage** with articles or social media content
2. **Click the extension icon** in Chrome toolbar to open the sidebar
3. **Select summary type** from the dropdown (key-points, headline, teaser)
4. **Click "Start Generation"** to begin automatic summarization
5. **Summaries appear** in the sidebar, grouped by website
6. **Click any summary** to jump to the original content
7. **Use "Stop All"** to halt all summarization processes

### Controls

-   **Start Generation**: Begins automatic content detection and summarization
-   **Stop Generation**: Pauses the current summarization process
-   **Stop All**: Completely stops all generation and prevents new ones
-   **Clear**: Removes all summaries from the sidebar
-   **Summary Type**: Choose between key-points, headline, or teaser formats

## Requirements

-   **Chrome 116+** (for AI Summarizer API support)
-   **Windows/Linux/macOS**
-   **Chrome AI APIs enabled** (may require enabling experimental features)

### Enabling AI Features

1. Open Chrome and navigate to `chrome://flags/`
2. Search for "AI" or "Summarizer"
3. Enable the relevant AI features
4. Restart Chrome

## Architecture

### Background Script (`background.js`)

-   Manages tab activation and URL changes
-   Coordinates communication between sidebar and content scripts
-   Handles extension lifecycle events

### Content Script (`content.js`)

-   Detects page type (article vs. feed)
-   Extracts readable content from web pages
-   Performs AI summarization using Chrome's Summarizer API
-   Manages deduplication and content hashing

### Sidebar (`sidebar.js`, `sidebar.html`, `sidebar.css`)

-   Provides user interface for controls and settings
-   Displays summarized content grouped by website
-   Adapts to website themes automatically
-   Manages generation state and user preferences

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and test thoroughly
4. Run the build: `npm run build`
5. Test the extension in Chrome
6. Commit your changes: `git commit -am 'Add feature'`
7. Push to the branch: `git push origin feature-name`
8. Submit a pull request

### Development Guidelines

-   Follow ES6+ JavaScript standards
-   Use async/await for asynchronous operations
-   Maintain Chrome extension best practices
-   Test on multiple websites and content types
-   Ensure accessibility and responsive design

## Privacy & Security

-   All summarization happens locally using Chrome's built-in AI APIs
-   No data is sent to external servers
-   Content processing is performed in the browser
-   Settings and processed content hashes are stored locally

## Troubleshooting

### Extension Not Working

-   Ensure Chrome version 116 or higher
-   Check that AI features are enabled in `chrome://flags/`
-   Try reloading the extension in `chrome://extensions/`
-   Check browser console for error messages

### Summarization Not Starting

-   Verify the webpage has substantial text content
-   Check if the content has already been summarized
-   Ensure "Start Generation" has been clicked
-   Try refreshing the page

### Theme Not Adapting

-   Some websites may have complex CSS that prevents theme detection
-   The extension falls back to light theme if detection fails
-   Manual refresh may be needed for theme changes

## License

MIT License - see [LICENSE](LICENSE) file for details

## Acknowledgments

-   Built using Chrome's AI APIs
-   Inspired by the need for efficient content consumption
-   Thanks to the Chrome Extensions community

## Support

-   [GitHub Issues](https://github.com/HectorGitt/DoomDigest/issues) for bug reports
-   [GitHub Discussions](https://github.com/HectorGitt/DoomDigest/discussions) for questions
-   [Chrome Web Store](https://chrome.google.com/webstore) for user reviews</content>
    <parameter name="filePath">c:\Users\USER\Documents\Codes\Typescript\speak\README.md
