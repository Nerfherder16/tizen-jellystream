JellyStream Master Implementation Plan
Overview
Transform JellyStream from a JavaScript overlay to a proper standalone Samsung Tizen TV app that combines Jellyfin (media server) and Jellyseerr (request management), emulating Streamyfin's polish.

Architecture
Core Structure:

Standalone Tizen .wgt packaged app
Hash-based client-side routing
Centralized state management with localStorage persistence
Modular screen architecture
TV-optimized UI with remote control support
Key Components:

State Manager (js/state-manager.js)

Centralized state for Jellyfin and Jellyseerr connections
localStorage persistence across sessions
Authentication state tracking
Lifecycle Manager (js/lifecycle.js)

Tizen app lifecycle events (init, pause, resume, exit)
Proper cleanup and state preservation
Router (js/router.js)

Hash-based navigation (#/splash, #/home, #/player, etc.)
Screen transitions
History management
API Clients

js/api/jellyfin-client.js - Jellyfin REST API wrapper
js/api/jellyseerr-client.js - Jellyseerr API wrapper
Screens (each with init/load/unload lifecycle)

Splash Screen - Initial loading and auto-auth
Login Screen - Manual authentication (for production)
Home Screen - Continue watching, trending, recently added
Discover Screen - Browse and search content
Library Screen - Organized media collections
Player Screen - Video playback with controls
Search Screen - Global search
Settings Screen - App configuration
Implementation Phases
Phase 1: Foundation ✅ COMPLETED

Core files (state-manager, lifecycle, router, main.js)
API clients (jellyfin-client, jellyseerr-client)
Basic screens (splash, login, home)
index.html structure
main.css with TV-optimized styles
Phase 2: Authentication ✅ COMPLETED

Dev mode auto-authentication
Query parameter auth (workaround for SSO plugin)
Jellyseerr proxy for CORS
State persistence
Phase 3: Home Screen ✅ COMPLETED

Continue watching from Jellyfin
Trending content from Jellyseerr
Recently added media
Media card components with images
Click handlers (placeholders)
Phase 4: Remaining Screens (NEXT)

Discover screen with categories
Library screen with collections
Search functionality
Settings screen
Phase 5: Video Player (NEXT)

Jellyfin video playback
Transport controls (play/pause, seek, volume)
Subtitle selection
Audio track selection
Resume position tracking
Phase 6: Polish

TV remote control navigation
Focus management
Loading states and animations
Error handling
Performance optimization
Phase 7: Production

Remove dev mode hardcoded credentials
Build authentication proxy for token refresh
Package as .wgt for Tizen TV
Testing on actual Samsung TV
Current Status
✅ Phase 1 & 2 completed
✅ Phase 3 completed (home screen working with content)
🔄 Ready for Phase 4 (remaining screens)
Known Issues Resolved
✅ Jellyfin SSO plugin breaks X-Emby-Authorization header → using ?api_key= query param
✅ Jellyseerr CORS errors → using dev server proxy at /api/jellyseerr/
✅ Token expiration → dev mode uses hardcoded fallback (needs permanent solution)
Confidence Score: 82% - Architecture is solid, main risks are TV remote control integration and production authentication flow.


