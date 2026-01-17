/**
 * JellyStream - TMDB API Client
 * Handles TMDB API requests for Discover page content
 */
(function(window) {
    'use strict';

    var TMDBClient = {
        _apiKey: 'cbc14abff010d33d58ae4be0e452c622',
        _apiBase: 'https://api.themoviedb.org/3',
        _imageBase: 'https://image.tmdb.org/t/p/',

        /**
         * Make API request to TMDB
         */
        _request: function(endpoint, params) {
            params = params || {};
            params.api_key = this._apiKey;

            var queryString = Object.keys(params).map(function(key) {
                return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
            }).join('&');

            var url = this._apiBase + endpoint + '?' + queryString;

            return fetch(url)
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error('TMDB API error: ' + response.status);
                    }
                    return response.json();
                });
        },

        // ==================== IMAGE HELPERS ====================

        /**
         * Get full poster URL
         * Sizes: w92, w154, w185, w342, w500, w780, original
         */
        getPosterUrl: function(posterPath, size) {
            if (!posterPath) return null;
            size = size || 'w342';
            return this._imageBase + size + posterPath;
        },

        /**
         * Get full backdrop URL
         * Sizes: w300, w780, w1280, original
         */
        getBackdropUrl: function(backdropPath, size) {
            if (!backdropPath) return null;
            size = size || 'w780';
            return this._imageBase + size + backdropPath;
        },

        /**
         * Get profile image URL
         * Sizes: w45, w185, h632, original
         */
        getProfileUrl: function(profilePath, size) {
            if (!profilePath) return null;
            size = size || 'w185';
            return this._imageBase + size + profilePath;
        },

        // ==================== MOVIES ====================

        /**
         * Get trending movies (day or week)
         */
        getTrendingMovies: function(timeWindow, page) {
            timeWindow = timeWindow || 'week';
            page = page || 1;
            return this._request('/trending/movie/' + timeWindow, { page: page });
        },

        /**
         * Get popular movies
         */
        getPopularMovies: function(page) {
            page = page || 1;
            return this._request('/movie/popular', { page: page });
        },

        /**
         * Get now playing movies
         */
        getNowPlayingMovies: function(page) {
            page = page || 1;
            return this._request('/movie/now_playing', { page: page });
        },

        /**
         * Get upcoming movies
         */
        getUpcomingMovies: function(page) {
            page = page || 1;
            return this._request('/movie/upcoming', { page: page });
        },

        /**
         * Get top rated movies
         */
        getTopRatedMovies: function(page) {
            page = page || 1;
            return this._request('/movie/top_rated', { page: page });
        },

        /**
         * Get movie details
         */
        getMovieDetails: function(movieId) {
            return this._request('/movie/' + movieId, {
                append_to_response: 'credits,videos,similar'
            });
        },

        // ==================== TV SHOWS ====================

        /**
         * Get trending TV shows (day or week)
         */
        getTrendingShows: function(timeWindow, page) {
            timeWindow = timeWindow || 'week';
            page = page || 1;
            return this._request('/trending/tv/' + timeWindow, { page: page });
        },

        /**
         * Get popular TV shows
         */
        getPopularShows: function(page) {
            page = page || 1;
            return this._request('/tv/popular', { page: page });
        },

        /**
         * Get airing today
         */
        getAiringTodayShows: function(page) {
            page = page || 1;
            return this._request('/tv/airing_today', { page: page });
        },

        /**
         * Get on the air (currently airing shows)
         */
        getOnTheAirShows: function(page) {
            page = page || 1;
            return this._request('/tv/on_the_air', { page: page });
        },

        /**
         * Get top rated TV shows
         */
        getTopRatedShows: function(page) {
            page = page || 1;
            return this._request('/tv/top_rated', { page: page });
        },

        /**
         * Get TV show details
         */
        getShowDetails: function(showId) {
            return this._request('/tv/' + showId, {
                append_to_response: 'credits,videos,similar'
            });
        },

        /**
         * Get TV season details
         */
        getSeasonDetails: function(showId, seasonNumber) {
            return this._request('/tv/' + showId + '/season/' + seasonNumber);
        },

        // ==================== SEARCH ====================

        /**
         * Multi search (movies, TV, people)
         */
        searchMulti: function(query, page) {
            page = page || 1;
            return this._request('/search/multi', { query: query, page: page });
        },

        /**
         * Search movies
         */
        searchMovies: function(query, page) {
            page = page || 1;
            return this._request('/search/movie', { query: query, page: page });
        },

        /**
         * Search TV shows
         */
        searchShows: function(query, page) {
            page = page || 1;
            return this._request('/search/tv', { query: query, page: page });
        },

        // ==================== GENRES ====================

        /**
         * Get movie genres
         */
        getMovieGenres: function() {
            return this._request('/genre/movie/list');
        },

        /**
         * Get TV genres
         */
        getTVGenres: function() {
            return this._request('/genre/tv/list');
        },

        /**
         * Discover movies by genre
         */
        discoverMoviesByGenre: function(genreId, page) {
            page = page || 1;
            return this._request('/discover/movie', {
                with_genres: genreId,
                page: page,
                sort_by: 'popularity.desc'
            });
        },

        /**
         * Discover TV by genre
         */
        discoverShowsByGenre: function(genreId, page) {
            page = page || 1;
            return this._request('/discover/tv', {
                with_genres: genreId,
                page: page,
                sort_by: 'popularity.desc'
            });
        },

        // ==================== FORMATTING ====================

        /**
         * Format movie for display
         */
        formatMovie: function(movie) {
            return {
                id: movie.id,
                tmdbId: movie.id,
                title: movie.title,
                originalTitle: movie.original_title,
                overview: movie.overview,
                posterPath: movie.poster_path,
                backdropPath: movie.backdrop_path,
                posterUrl: this.getPosterUrl(movie.poster_path),
                backdropUrl: this.getBackdropUrl(movie.backdrop_path),
                releaseDate: movie.release_date,
                year: movie.release_date ? movie.release_date.substring(0, 4) : null,
                rating: movie.vote_average,
                voteCount: movie.vote_count,
                popularity: movie.popularity,
                genreIds: movie.genre_ids,
                adult: movie.adult,
                type: 'movie',
                mediaType: 'movie'
            };
        },

        /**
         * Format TV show for display
         */
        formatShow: function(show) {
            return {
                id: show.id,
                tmdbId: show.id,
                title: show.name,
                originalTitle: show.original_name,
                overview: show.overview,
                posterPath: show.poster_path,
                backdropPath: show.backdrop_path,
                posterUrl: this.getPosterUrl(show.poster_path),
                backdropUrl: this.getBackdropUrl(show.backdrop_path),
                firstAirDate: show.first_air_date,
                year: show.first_air_date ? show.first_air_date.substring(0, 4) : null,
                rating: show.vote_average,
                voteCount: show.vote_count,
                popularity: show.popularity,
                genreIds: show.genre_ids,
                type: 'show',
                mediaType: 'tv'
            };
        },

        /**
         * Format search result (auto-detect type)
         */
        formatResult: function(item) {
            if (item.media_type === 'movie' || item.title) {
                return this.formatMovie(item);
            } else if (item.media_type === 'tv' || item.name) {
                return this.formatShow(item);
            }
            return item;
        },

        /**
         * Format array of results
         */
        formatResults: function(results) {
            var self = this;
            return results.map(function(item) {
                return self.formatResult(item);
            }).filter(function(item) {
                // Filter out people and items without posters
                return item.type && item.posterPath;
            });
        }
    };

    // Export to window
    window.TMDBClient = TMDBClient;

})(window);
