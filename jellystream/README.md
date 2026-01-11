# Tizen JellyStream

![Streamy Tube Banner](images/banner.jpg)

A custom Samsung Tizen TV app for Jellyfin with Jellyseerr integration.

## Features

- **Quick Connect Authentication** - Easily connect your TV using Jellyfin's Quick Connect
- **Full Settings System** - Playback, subtitles (with live preview), and display settings matching Jellyfin web client
- **Jellyseerr Integration** - Browse and request content directly from your TV
- **Library Browsing** - Sort and browse your media libraries with a modern UI
- **TV Remote Optimized** - D-pad focus management designed for TV remotes

## Screenshots

*Coming soon*

## Installation

### Prerequisites
- Samsung Tizen TV (2017 or newer)
- Jellyfin server
- (Optional) Jellyseerr for content discovery

### Building
```bash
npm install
npm run build
```

### Deploying to TV
Use Tizen Studio or the Tizen CLI to package and deploy the app to your TV.

## Development

```bash
npm run dev
```

## Architecture

- **Modular Screens** - `library-screen.js`, `settings-screen.js`, `home-screen.js`, etc.
- **API Clients** - `jellyfin-client.js`, `jellyseerr-client.js`
- **State Management** - Centralized `StateManager`
- **Focus Management** - `FocusManager` optimized for TV remote navigation
- **Modal System** - `ModalManager` for detail views and settings

## License

MIT
