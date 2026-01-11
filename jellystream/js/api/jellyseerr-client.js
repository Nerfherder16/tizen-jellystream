/**
 * JellyStream - Jellyseerr API Client
 * Handles all communication with Jellyseerr server
 */
(function(window) {
    'use strict';

    var JellyseerrClient = {
        _baseUrl: null,
        _apiKey: null,
        _initialized: false,

        /**
         * Initialize the API client with server URL and API key
         */
        init: function(baseUrl, apiKey) {
            // Store the actual URL (remove trailing slash)
            this._baseUrl = baseUrl ? baseUrl.replace(/\/$/, '') : null;
            this._apiKey = apiKey;
            this._initialized = !!(this._baseUrl && this._apiKey);
            console.log('JellyseerrClient: Initialized', {
                baseUrl: this._baseUrl,
                hasApiKey: !!this._apiKey,
                initialized: this._initialized
            });
            return this._initialized;
        },

        /**
         * Check if the API is configured
         */
        isConfigured: function() {
            return this._initialized;
        },

        /**
         * Make an API request to Jellyseerr
         */
        _request: function(endpoint, options) {
            options = options || {};

            if (!this._initialized) {
                return Promise.reject(new Error('Jellyseerr API not configured'));
            }

            var url = this._baseUrl + '/api/v1' + endpoint;
            console.log('JellyseerrClient: Fetching', url);

            var fetchOptions = {
                method: options.method || 'GET',
                headers: {
                    'X-Api-Key': this._apiKey,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            };

            if (options.body) {
                fetchOptions.body = JSON.stringify(options.body);
            }

            return fetch(url, fetchOptions)
                .then(function(response) {
                    console.log('JellyseerrClient: Response', response.status, response.statusText);
                    if (!response.ok) {
                        return response.text().then(function(text) {
                            console.error('JellyseerrClient: Error body', text);
                            throw new Error('Jellyseerr API error: ' + response.status + ' ' + response.statusText);
                        });
                    }
                    return response.json();
                })
                .catch(function(error) {
                    console.error('JellyseerrClient: Request failed', endpoint, error);
                    throw error;
                });
        },

        /**
         * Test connection to Jellyseerr server
         */
        testConnection: function() {
            return this._request('/status')
                .then(function(data) {
                    return { success: true, version: data.version };
                })
                .catch(function(error) {
                    return { success: false, error: error.message };
                });
        },

        /**
         * Get trending (combined movies and TV)
         */
        getTrending: function(page) {
            page = page || 1;
            return this._request('/discover/trending?page=' + page);
        },

        /**
         * Get trending movies
         */
        getTrendingMovies: function(page) {
            page = page || 1;
            return this._request('/discover/movies?page=' + page);
        },

        /**
         * Get trending TV shows
         */
        getTrendingTv: function(page) {
            page = page || 1;
            return this._request('/discover/tv?page=' + page);
        },

        /**
         * Get popular movies
         */
        getPopularMovies: function(page) {
            page = page || 1;
            return this._request('/discover/movies/popular?page=' + page);
        },

        /**
         * Get popular TV shows
         */
        getPopularTv: function(page) {
            page = page || 1;
            return this._request('/discover/tv/popular?page=' + page);
        },

        /**
         * Get upcoming movies
         */
        getUpcomingMovies: function(page) {
            page = page || 1;
            return this._request('/discover/movies/upcoming?page=' + page);
        },

        /**
         * Get upcoming TV shows
         */
        getUpcomingTv: function(page) {
            page = page || 1;
            var today = new Date().toISOString().split('T')[0];
            return this._request('/discover/tv?page=' + page + '&firstAirDateGte=' + today);
        },

        /**
         * Search for movies and TV shows
         */
        search: function(query, page) {
            page = page || 1;
            return this._request('/search?query=' + encodeURIComponent(query) + '&page=' + page);
        },

        /**
         * Get movie details
         */
        getMovie: function(tmdbId) {
            return this._request('/movie/' + tmdbId);
        },

        /**
         * Get TV show details
         */
        getTvShow: function(tmdbId) {
            return this._request('/tv/' + tmdbId);
        },

        /**
         * Get media details (movie or TV)
         */
        getMediaDetails: function(mediaType, tmdbId) {
            if (mediaType === 'movie') {
                return this.getMovie(tmdbId);
            } else {
                return this.getTvShow(tmdbId);
            }
        },

        /**
         * Discover by genre
         */
        discoverByGenre: function(mediaType, genreId, page) {
            page = page || 1;
            var endpoint = mediaType === 'movie' ? '/discover/movies' : '/discover/tv';
            return this._request(endpoint + '?page=' + page + '&genre=' + genreId);
        },

        /**
         * Get all requests (pending, approved, available)
         */
        getRequests: function(options) {
            options = options || {};
            var params = [];
            if (options.take) params.push('take=' + options.take);
            if (options.skip) params.push('skip=' + options.skip);
            if (options.filter) params.push('filter=' + options.filter);
            if (options.sort) params.push('sort=' + options.sort);

            var queryString = params.length ? '?' + params.join('&') : '';
            return this._request('/request' + queryString);
        },

        /**
         * Get user's own requests
         */
        getMyRequests: function(options) {
            options = options || {};
            var params = [];
            if (options.take) params.push('take=' + options.take);
            if (options.skip) params.push('skip=' + options.skip);

            var queryString = params.length ? '?' + params.join('&') : '';
            return this._request('/request/me' + queryString);
        },

        /**
         * Create a movie request
         */
        requestMovie: function(tmdbId) {
            return this._request('/request', {
                method: 'POST',
                body: {
                    mediaType: 'movie',
                    mediaId: tmdbId
                }
            });
        },

        /**
         * Create a TV show request
         */
        requestTv: function(tmdbId, seasons) {
            var body = {
                mediaType: 'tv',
                mediaId: tmdbId
            };
            if (seasons) {
                body.seasons = seasons;
            }
            return this._request('/request', {
                method: 'POST',
                body: body
            });
        },

        /**
         * Request media (movie or TV)
         */
        requestMedia: function(mediaType, tmdbId, seasons) {
            if (mediaType === 'movie') {
                return this.requestMovie(tmdbId);
            } else {
                return this.requestTv(tmdbId, seasons);
            }
        },

        /**
         * Get media status (availability in Jellyfin)
         */
        getMediaStatus: function(tmdbId, mediaType) {
            var endpoint = mediaType === 'movie' ? '/movie/' : '/tv/';
            return this._request(endpoint + tmdbId)
                .then(function(data) {
                    return {
                        mediaType: mediaType,
                        tmdbId: tmdbId,
                        status: data.mediaInfo ? data.mediaInfo.status : null,
                        jellyfinMediaId: data.mediaInfo ? data.mediaInfo.jellyfinMediaId : null,
                        available: data.mediaInfo && data.mediaInfo.status === 5,
                        requested: data.mediaInfo && data.mediaInfo.status >= 2
                    };
                });
        },

        /**
         * Get recently added media (available in Jellyfin via Jellyseerr)
         */
        getRecentlyAdded: function(take) {
            take = take || 20;
            return this._request('/media?take=' + take + '&filter=available&sort=added');
        },

        /**
         * Map Jellyseerr status code to human-readable string
         */
        getStatusText: function(statusCode) {
            var statusMap = {
                1: 'Unknown',
                2: 'Pending',
                3: 'Processing',
                4: 'Partially Available',
                5: 'Available'
            };
            return statusMap[statusCode] || 'Unknown';
        },

        /**
         * Map Jellyseerr status code to CSS class
         */
        getStatusClass: function(statusCode) {
            var classMap = {
                1: 'status-unknown',
                2: 'status-pending',
                3: 'status-processing',
                4: 'status-partial',
                5: 'status-available'
            };
            return classMap[statusCode] || 'status-unknown';
        },

        /**
         * Get TV shows by network
         */
        getTvByNetwork: function(networkId, page) {
            page = page || 1;
            return this._request('/discover/tv/network/' + networkId + '?page=' + page);
        },

        /**
         * Get movies by genre
         */
        getMoviesByGenre: function(genreId, page) {
            page = page || 1;
            return this._request('/discover/movies/genre/' + genreId + '?page=' + page);
        },

        /**
         * Get TV by genre
         */
        getTvByGenre: function(genreId, page) {
            page = page || 1;
            return this._request('/discover/tv/genre/' + genreId + '?page=' + page);
        },

        /**
         * Get available TV networks
         */
        getNetworks: function() {
            // Popular streaming networks with TMDB IDs
            return Promise.resolve([
                { id: 213, name: 'Netflix', logo: 'netflix' },
                { id: 1024, name: 'Prime Video', logo: 'prime' },
                { id: 2739, name: 'Disney+', logo: 'disney' },
                { id: 453, name: 'Hulu', logo: 'hulu' },
                { id: 2552, name: 'Apple TV+', logo: 'apple' },
                { id: 3186, name: 'Max', logo: 'max' },
                { id: 4330, name: 'Paramount+', logo: 'paramount' },
                { id: 4, name: 'BBC One', logo: 'bbc' },
                { id: 49, name: 'HBO', logo: 'hbo' },
                { id: 67, name: 'Showtime', logo: 'showtime' },
                { id: 2, name: 'ABC', logo: 'abc' },
                { id: 6, name: 'NBC', logo: 'nbc' },
                { id: 16, name: 'CBS', logo: 'cbs' },
                { id: 19, name: 'FOX', logo: 'fox' },
                { id: 71, name: 'The CW', logo: 'cw' },
                { id: 174, name: 'AMC', logo: 'amc' },
                { id: 88, name: 'FX', logo: 'fx' },
                { id: 318, name: 'Starz', logo: 'starz' }
            ]);
        },

        /**
         * Get movie genres
         */
        getMovieGenres: function() {
            return Promise.resolve([
                { id: 28, name: 'Action' },
                { id: 12, name: 'Adventure' },
                { id: 16, name: 'Animation' },
                { id: 35, name: 'Comedy' },
                { id: 80, name: 'Crime' },
                { id: 99, name: 'Documentary' },
                { id: 18, name: 'Drama' },
                { id: 10751, name: 'Family' },
                { id: 14, name: 'Fantasy' },
                { id: 36, name: 'History' },
                { id: 27, name: 'Horror' },
                { id: 10402, name: 'Music' },
                { id: 9648, name: 'Mystery' },
                { id: 10749, name: 'Romance' },
                { id: 878, name: 'Sci-Fi' },
                { id: 53, name: 'Thriller' },
                { id: 10752, name: 'War' },
                { id: 37, name: 'Western' }
            ]);
        },

        /**
         * Get TV genres
         */
        getTvGenres: function() {
            return Promise.resolve([
                { id: 10759, name: 'Action & Adventure' },
                { id: 16, name: 'Animation' },
                { id: 35, name: 'Comedy' },
                { id: 80, name: 'Crime' },
                { id: 99, name: 'Documentary' },
                { id: 18, name: 'Drama' },
                { id: 10751, name: 'Family' },
                { id: 10762, name: 'Kids' },
                { id: 9648, name: 'Mystery' },
                { id: 10763, name: 'News' },
                { id: 10764, name: 'Reality' },
                { id: 10765, name: 'Sci-Fi & Fantasy' },
                { id: 10766, name: 'Soap' },
                { id: 10767, name: 'Talk' },
                { id: 10768, name: 'War & Politics' },
                { id: 37, name: 'Western' }
            ]);
        }
    };

    // Export to window
    window.JellyseerrClient = JellyseerrClient;

})(window);
