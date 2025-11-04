// Version: 2.5.1
document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration and State ---
    const TMDB_API_KEY = '171cd09790cc417d6dce747db2ee0ba6';
    const OMDB_API_KEY = '147f4932'; // <-- IMPORTANT: Replace with your OMDb API key
    const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
    const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
    const JS_VERSION = '3.3.0';
    const HTML_VERSION = '1.5.0';

    // This will hold the list of movie objects {id, watched}, loaded from an external file.
    let movieList = [];
    let currentTitle = '';
    let currentYear = '';
    let currentListId = ''; // NEW: Will hold the unique ID of the current list.
    let currentView = localStorage.getItem('movieListView') || 'card'; // 'card' or 'list'

    // --- DOM Elements ---
    const movieListContainer = document.getElementById('movie-list');
    const mainTitle = document.getElementById('main-title');
    const yearSelect = document.getElementById('year-select');
    const cardViewBtn = document.getElementById('card-view-btn');
    const listViewBtn = document.getElementById('list-view-btn');
    const watchedTally = document.getElementById('watched-tally');
    const addMovieBtn = document.getElementById('add-movie-btn');
    const importListBtn = document.getElementById('import-list-btn');
    const exportJsonBtn = document.getElementById('export-json-btn');
    const importJsonBtn = document.getElementById('import-json-btn');
    const createListBtn = document.getElementById('create-list-btn');
    const deleteListBtn = document.getElementById('delete-list-btn');
    const actionsMenuBtn = document.getElementById('actions-menu-btn');
    const actionsDropdown = document.getElementById('actions-dropdown-content');
    const searchModal = document.getElementById('search-modal');
    const detailsModal = document.getElementById('details-modal');
    const detailsModalContent = document.getElementById('details-modal-content-container');
    const closeDetailsModalBtn = detailsModal.querySelector('.close-btn');
    const closeModalBtn = searchModal.querySelector('.close-btn');
    const searchInput = document.getElementById('movie-search-input');
    const searchSubmitBtn = document.getElementById('search-submit-btn');
    const searchResultsContainer = document.getElementById('search-results');
    const loadingMessage = document.getElementById('loading-message');
    const cardSizeSlider = document.getElementById('card-size-slider');


    // --- Core Functions ---

    /**
     * Loads the list of movies for a specific year from the server.
     * @param {string} listId - The ID of the list to load (e.g., '2025').
     */
    async function loadMoviesForYear(listId) {
        try {
            const listKey = `movie-list-${listId}`;
            const dataString = localStorage.getItem(listKey);
            let data;

            if (dataString) {
                data = JSON.parse(dataString);
            } else {
                throw new Error(`List with ID ${listId} not found in localStorage.`);
            }
            movieList = data.movies || [];
            currentTitle = data.title || `Untitled List`;
            currentYear = data.year; // Get year from the list object
            currentListId = listId; // Set the current unique ID
            mainTitle.textContent = currentTitle;
        } catch (error) {
            console.error(`Could not load movie list for ${listId} from localStorage:`, error);
            movieListContainer.innerHTML = `<p class="empty-list-message">Error: Could not load the movie list for ${listId}.</p>`;
        }
    }

    /**
     * Fetches details for a single movie ID from TMDB.
     * Includes a separate call for the director, as it's not in the main details endpoint.
     * @param {number} tmdbId - The TMDB ID of the movie.
     * @returns {Promise<object>} - Movie data including director.
     */
    async function fetchMovieDetails(tmdbId) {
        try {
            const cacheKey = `movie-details-${tmdbId}`;
            const cachedDataString = localStorage.getItem(cacheKey);
            if (cachedDataString) {
                // Data is in cache, parse and return it.
                return JSON.parse(cachedDataString);
            }

            // 1. Fetch main details
            const detailsUrl = `${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
            const detailsResponse = await fetch(detailsUrl);
            const movieDetails = await detailsResponse.json();

            // 2. Fetch credits to get the director
            const creditsUrl = `${TMDB_BASE_URL}/movie/${tmdbId}/credits?api_key=${TMDB_API_KEY}`;
            const creditsResponse = await fetch(creditsUrl);
            const credits = await creditsResponse.json();

            // 3. Fetch external IDs to get IMDb ID
            const externalIdsUrl = `${TMDB_BASE_URL}/movie/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
            const externalIdsResponse = await fetch(externalIdsUrl);
            const externalIds = await externalIdsResponse.json();
            const imdbId = externalIds.imdb_id;

            // 4. Fetch OMDb data using IMDb ID to get Rotten Tomatoes score
            let rottenTomatoesScore = 'N/A';
            let imdbScore = 'N/A';
            if (imdbId && OMDB_API_KEY !== 'YOUR_OMDB_KEY_HERE') {
                const omdbUrl = `https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_API_KEY}`;
                const omdbResponse = await fetch(omdbUrl);
                const omdbData = await omdbResponse.json();
                const rtRating = omdbData.Ratings?.find(rating => rating.Source === 'Rotten Tomatoes');
                if (rtRating) {
                    rottenTomatoesScore = rtRating.Value;
                }
                if (omdbData.imdbRating) {
                    imdbScore = omdbData.imdbRating;
                }
            } else {
                if (OMDB_API_KEY === 'YOUR_OMDB_KEY_HERE') {
                    console.warn(`OMDb API key is missing. Skipping Rotten Tomatoes score fetch. Get a key from http://www.omdbapi.com/apikey.aspx`);
                }
            }

            // Find the director in the crew
            const director = credits.crew.find(member => member.job === 'Director');
            const directorName = director ? director.name : 'N/A';

            const movieDataToReturn = {
                id: movieDetails.id,
                title: movieDetails.title,
                release_year: movieDetails.release_date ? movieDetails.release_date.substring(0, 4) : 'N/A',
                poster_path: movieDetails.poster_path,
                director: directorName,
                overview: movieDetails.overview || 'No description available.',
                rottenTomatoesScore: rottenTomatoesScore,
                imdbScore: imdbScore
            };

            // Save the complete data to cache for future use.
            try {
                localStorage.setItem(cacheKey, JSON.stringify(movieDataToReturn));
            } catch (e) {
                console.error("Failed to cache movie details. LocalStorage might be full.", e);
            }

            return movieDataToReturn;
        } catch (error) {
            console.error(`Error fetching movie details for ID ${tmdbId}:`, error);
            return null;
        }
    }

    /**
     * Renders a single movie card to the DOM.
     * @param {object} movie - The movie data object.
     * @param {number} index - The movie's position on the list (1-based).
     */
    function createMovieCard(movie, index) {
        const isWatched = movie.watched;

        const movieCard = document.createElement('div');
        movieCard.className = 'movie-card';
        if (isWatched) {
            movieCard.classList.add('watched');
        }
        movieCard.style.position = 'relative';
        movieCard.dataset.tmdbId = movie.id; // Add ID to the card itself for easy access
        
        const posterUrl = movie.poster_path 
            ? `${TMDB_IMAGE_BASE_URL}${movie.poster_path}` 
            : 'https://via.placeholder.com/500x750?text=No+Poster';

        movieCard.innerHTML = `
            <div class="card-number">${index + 1}</div>
            <div class="card-poster">
                <img src="${posterUrl}" alt="Poster for ${movie.title}">
            </div>
            <div class="card-info">
                <h3>${movie.title}</h3>
                <div class="score-container">
                    <span class="rotten-tomatoes-score">🍅 ${movie.rottenTomatoesScore}</span>
                    <span class="imdb-score">⭐ ${movie.imdbScore}</span>
                </div>
                <button class="watched-toggle-btn ${isWatched ? 'is-watched' : ''}" data-tmdb-id="${movie.id}">
                    ${isWatched ? 'Mark as Unwatched' : 'Mark as Watched'}
                </button>
            </div>
        `;

        movieListContainer.appendChild(movieCard);
    }

    /**
     * Renders a single movie list item to the DOM for list view.
     * @param {object} movie - The movie data object.
     * @param {number} index - The movie's position on the list (1-based).
     */
    function createMovieListItem(movie, index) {
        const isWatched = movie.watched;

        const listItem = document.createElement('div');
        listItem.className = 'movie-list-item';
        if (isWatched) {
            listItem.classList.add('watched');
        }
        listItem.dataset.tmdbId = movie.id;

        listItem.innerHTML = `
            <div class="list-item-number">${index + 1}</div>
            <div class="list-item-info">
                <h3>${movie.title}</h3>
                <div class="list-item-meta">
                    <span>${movie.release_year}</span> | <span>${movie.director}</span>
                </div>
            </div>
            <div class="score-container">
                <span class="rotten-tomatoes-score">🍅 ${movie.rottenTomatoesScore}</span>
                <span class="imdb-score">⭐ ${movie.imdbScore}</span>
            </div>
            <button class="watched-toggle-btn ${isWatched ? 'is-watched' : ''}" data-tmdb-id="${movie.id}">
                ${isWatched ? 'Mark as Unwatched' : 'Mark as Watched'}
            </button>
        `;
        movieListContainer.appendChild(listItem);
    }

    /**
     * Sets the current view and updates the UI accordingly.
     * @param {string} view - The view to set ('card' or 'list').
     */
    function setView(view) {
        currentView = view;
        localStorage.setItem('movieListView', view);
        document.body.classList.toggle('list-view-active', view === 'list');
        cardViewBtn.classList.toggle('active', view === 'card');
        listViewBtn.classList.toggle('active', view === 'list');
    }

    /**
     * Updates the running tally of watched movies in the header.
     */
    function updateWatchedTally() {
        const watchedCount = movieList.filter(movie => movie.watched).length;
        watchedTally.textContent = `Watched: ${watchedCount} / ${movieList.length}`;
    }

    /**
     * Initializes the entire movie list by fetching details for all IDs.
     */
    async function renderMovieList() {
        console.log(`[renderMovieList] Starting for ${currentYear}.`);
        loadingMessage.style.display = 'block'; // Show loading message
        movieListContainer.innerHTML = ''; // Clear existing list

        if (movieList.length === 0) {
            movieListContainer.innerHTML = '<p class="empty-list-message">Your movie list is empty. Click "Add a Movie to the List" to get started!</p>';
        } else {
            // SIMPLIFICATION: Fetch details sequentially instead of in parallel to isolate issues.
            console.log(`[renderMovieList] Fetching details for ${movieList.length} movies sequentially...`);
            let moviesRendered = 0;
            const renderFunction = currentView === 'card' ? createMovieCard : createMovieListItem;

            for (const [index, movie] of movieList.entries()) {
                const movieDetails = await fetchMovieDetails(movie.id);
                if (movieDetails) {
                    const movieWithStatus = { ...movieDetails, watched: movie.watched };
                    renderFunction(movieWithStatus, index);
                    moviesRendered++;
                }
            }
            console.log(`[renderMovieList] Finished fetching. Rendered ${moviesRendered} movies.`);
        }

        if (movieList.length > 0 && movieListContainer.children.length === 0) {
            movieListContainer.innerHTML = '<p>Could not load any movie data. Please check your API key and network connection.</p>';
        }
        updateWatchedTally();
        loadingMessage.style.display = 'none'; // Hide loading message after initial list renders
    }

    /**
     * Opens the details modal for a specific movie.
     * @param {number} tmdbId - The ID of the movie to show details for.
     */
    async function openDetailsModal(tmdbId) {
        detailsModal.style.display = 'block';
        detailsModalContent.innerHTML = '<p>Loading details...</p>';

        const movieDetails = await fetchMovieDetails(tmdbId);
        const movieInList = movieList.find(m => m.id === tmdbId);

        if (!movieDetails || !movieInList) {
            detailsModalContent.innerHTML = '<p>Could not load movie details.</p>';
            return;
        }

        const isWatched = movieInList.watched;
        const posterUrl = movieDetails.poster_path
            ? `${TMDB_IMAGE_BASE_URL}${movieDetails.poster_path}`
            : 'https://via.placeholder.com/400x600?text=No+Poster';

        detailsModalContent.innerHTML = `
            <div class="details-poster">
                <img src="${posterUrl}" alt="Poster for ${movieDetails.title}">
            </div>
            <div class="details-info">
                <h2>${movieDetails.title}</h2>
                <p class="description">${movieDetails.overview}</p>
                <div class="details-meta">
                    <p><strong>Director:</strong> ${movieDetails.director}</p>
                    <p><strong>Released:</strong> ${movieDetails.release_year}</p>
                    <p><strong>TMDB ID:</strong> ${movieDetails.id}</p>
                    <p><strong>Rotten Tomatoes:🍅</strong> ${movieDetails.rottenTomatoesScore}</p>
                    <p><strong>IMDb Rating:⭐</strong> ${movieDetails.imdbScore}</p>
                </div>
                <div class="details-actions">
                    <button class="watched-toggle-btn ${isWatched ? 'is-watched' : ''}" data-tmdb-id="${movieDetails.id}">
                        ${isWatched ? 'Mark as Unwatched' : 'Mark as Watched'}
                    </button>
                    <button class="remove-movie-btn" data-tmdb-id="${movieDetails.id}">Remove</button>
                </div>
            </div>
        `;
    }

    /**
     * Imports movies from a user-selected JSON file.
     * The JSON file should contain an array of movie objects, e.g., [{"id": 123, "watched": false}].
     * It merges new movies into the current list, avoiding duplicates.
     */
    function importMoviesFromJson() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json,application/json';

        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) {
                return; // User cancelled the dialog
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const content = e.target.result;
                    const importedData = JSON.parse(content);
                    
                    // Validate that the imported data is an object with a 'movies' array
                    if (typeof importedData !== 'object' || importedData === null || !Array.isArray(importedData.movies)) {
                        throw new Error("JSON file is not in the expected format (e.g., {title: '...', movies: [...]}).");
                    }

                    // Optionally update the current list's title if provided in the import
                    if (importedData.title && importedData.title !== currentTitle) {
                        currentTitle = importedData.title;
                        mainTitle.textContent = currentTitle;
                        saveMovieListToServer(); // Save the new title immediately
                    }

                    const moviesToImport = importedData.movies.filter(movie =>
                        movie && typeof movie.id === 'number' && !isNaN(movie.id)
                    ).map(movie => ({
                        id: movie.id,
                        watched: !!movie.watched // Ensure 'watched' is a boolean
                    }));
                    
                    if (moviesToImport.length === 0) {
                        alert("No valid movies found in the JSON file.");
                        return;
                    }

                    const existingIds = new Set(movieList.map(movie => movie.id));
                    const newMovies = [];
                    
                    moviesToImport.forEach(movie => {
                        if (!existingIds.has(movie.id)) {
                            newMovies.push(movie);
                            existingIds.add(movie.id);
                        }
                    });

                    movieList.push(...newMovies); // Add new movies to the current list
                    saveMovieListToServer();
                    renderMovieList();
                    alert(`${newMovies.length} new movies were imported successfully from the JSON file!`);
                } catch (error) {
                    console.error("Error processing JSON file:", error);
                    alert(`Failed to import from JSON file. Please ensure it's a valid JSON array of movies. Error: ${error.message}`);
                }
            };
            reader.readAsText(file);
        });

        fileInput.click(); // Open the file picker dialog
    }

    /**
     * Exports the current movie list to a JSON file.
     * The file will be named based on the current year and title, e.g., "2025_spoop_a_thon.json".
     */
    function exportMoviesToJson() {
        if (movieList.length === 0) {
            alert("Your current movie list is empty. Nothing to export.");
            return;
        }

        const dataToExport = {
            title: currentTitle,
            movies: movieList.map(movie => ({ id: movie.id, watched: movie.watched }))
        };

        const jsonString = JSON.stringify(dataToExport, null, 4); // Pretty print JSON

        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentYear}_${currentTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`; // Sanitize filename
        document.body.appendChild(a); // Append to body to make it clickable in some browsers
        a.click();
        document.body.removeChild(a); // Clean up
        URL.revokeObjectURL(url); // Release the object URL
        alert("Movie list exported successfully!");
    }

    /**
     * Imports a comma-separated list of TMDB IDs.
     */
    function importMovies() {
        const idString = prompt("Please paste a comma-separated list of TMDB IDs to import:");

        if (!idString) {
            return; // User cancelled
        }

        const idsToImport = idString
            .split(',')
            .map(id => parseInt(id.trim(), 10))
            .filter(id => !isNaN(id) && id > 0); // Ensure they are valid numbers

        if (idsToImport.length === 0) {
            alert("No valid TMDB IDs were found in your input.");
            return;
        }

        const existingIds = new Set(movieList.map(movie => movie.id));
        const newMovies = [];

        idsToImport.forEach(id => {
            if (!existingIds.has(id)) {
                newMovies.push({ id: id, watched: false });
                existingIds.add(id); // Add to set to handle duplicates within the import list itself
            }
        });

        movieList.push(...newMovies);
        saveMovieListToServer();
        renderMovieList();
        alert(`${newMovies.length} new movies were imported successfully!`);
    }

    /**
     * Searches TMDB for movies based on a query string.
     * @param {string} query - The search term.
     */
    async function searchMovies(query) {
        if (!query.trim()) return;

        searchResultsContainer.innerHTML = '<p>Searching...</p>';
        const searchUrl = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1`;

        try {
            const response = await fetch(searchUrl);
            const data = await response.json();
            
            searchResultsContainer.innerHTML = ''; // Clear message

            if (data.results && data.results.length > 0) {
                // Limit to 25 results
                const results = data.results.slice(0, 25); 

                results.forEach(movie => {
                    const resultItem = document.createElement('div');
                    resultItem.className = 'search-result-item';

                    const posterUrl = movie.poster_path 
                        ? `${TMDB_IMAGE_BASE_URL}${movie.poster_path}` 
                        : 'https://via.placeholder.com/200x300?text=No+Poster';

                    const releaseYear = movie.release_date ? movie.release_date.substring(0, 4) : 'N/A';

                    resultItem.innerHTML = `
                        <img src="${posterUrl}" alt="Poster for ${movie.title}">
                        <div class="title">${movie.title}</div>
                        <div class="meta">(${releaseYear})</div>
                        <div class="meta">ID: ${movie.id}</div>
                        <button class="add-movie-button" data-tmdb-id="${movie.id}">Add to List</button>
                    `;
                    searchResultsContainer.appendChild(resultItem);
                });
            } else {
                searchResultsContainer.innerHTML = '<p>No movies found. Try a different title.</p>';
            }

        } catch (error) {
            console.error('Error during movie search:', error);
            searchResultsContainer.innerHTML = '<p>An error occurred during search.</p>';
        }
    }
    
    /**
     * Saves the current state of the movie list to the server.
     */
    async function saveMovieListToServer() {
        if (!currentListId) return;
        try {
            const listKey = `movie-list-${currentListId}`;
            const dataToSave = { id: currentListId, year: currentYear, title: currentTitle, movies: movieList };
            localStorage.setItem(listKey, JSON.stringify(dataToSave));
            console.log(`Movie list ${currentListId} saved to localStorage.`);
        } catch (error) {
            console.error('Failed to save movie list to localStorage:', error);
            alert('Error: Could not save changes. Your changes may be lost on refresh.');
        }
    }

    /**
     * Adds a movie to the list and re-renders the movie cards.
     * @param {number} tmdbId - The ID to add.
     */
    function addMovieToTheList(tmdbId) {
        tmdbId = Number(tmdbId);
        if (!movieList.some(movie => movie.id === tmdbId)) {
            movieList.push({ id: tmdbId, watched: false });
            renderMovieList(); // Re-render the UI
            saveMovieListToServer(); // Save the new list to the server
            alert(`Movie (ID: ${tmdbId}) added to the list!`);
            searchModal.style.display = 'none'; // Close the modal
        } else {
            alert('This movie is already in your list!');
        }
    }

    /**
     * Removes a movie from the list and re-renders the movie cards.
     * @param {number} tmdbId - The ID to remove.
     */
    function removeMovieFromTheList(tmdbId) {
        tmdbId = Number(tmdbId);
        const movieIndex = movieList.findIndex(movie => movie.id === tmdbId);
        if (movieIndex > -1) {
            movieList.splice(movieIndex, 1);
            renderMovieList(); // Re-render the UI
            saveMovieListToServer(); // Save the new list to the server
            alert(`Movie (ID: ${tmdbId}) removed from the list.`);
        }
    }

    /**
     * Toggles the watched status of a movie.
     * @param {number} tmdbId - The ID of the movie to toggle.
     */
    function toggleWatchedStatus(tmdbId) {
        tmdbId = Number(tmdbId);
        // Find the movie element on the page, which could be a card or a list item
        const movieItem = document.querySelector(`.movie-card[data-tmdb-id='${tmdbId}'], .movie-list-item[data-tmdb-id='${tmdbId}']`);
        const movieInList = movieList.find(movie => movie.id === tmdbId);

        if (movieInList && movieItem) {
            movieInList.watched = !movieInList.watched; // Toggle the status

            // Update the card on the main page
            movieItem.classList.toggle('watched', movieInList.watched);
            const itemButton = movieItem.querySelector('.watched-toggle-btn');
            if (itemButton) {
                itemButton.textContent = movieInList.watched ? 'Mark as Unwatched' : 'Mark as Watched';
                itemButton.classList.toggle('is-watched', movieInList.watched);
            }

            // If the details modal is open for this movie, update its button too
            const modalButton = detailsModal.querySelector(`.watched-toggle-btn[data-tmdb-id='${tmdbId}']`);
            if (modalButton) {
                modalButton.textContent = movieInList.watched ? 'Mark as Unwatched' : 'Mark as Watched';
                modalButton.classList.toggle('is-watched', movieInList.watched);
            }

            saveMovieListToServer();
            updateWatchedTally();
        }
    }

    /**
     * Fetches version numbers and displays them in the footer.
     */
    async function displayVersionNumbers() {
        document.getElementById('html-version').textContent = `HTML: ${HTML_VERSION}`;
        document.getElementById('js-version').textContent = `JS: ${JS_VERSION}`;
        
        // Remove server version display
        const serverVersionEl = document.getElementById('server-version');
        if (serverVersionEl) {
            serverVersionEl.remove();
        }
    }


    // --- Event Listeners ---

    // Handle view switcher clicks
    cardViewBtn.addEventListener('click', () => {
        setView('card');
        renderMovieList();
    });
    listViewBtn.addEventListener('click', () => {
        setView('list');
        renderMovieList();
    });

    // Handle Actions dropdown menu
    actionsMenuBtn.addEventListener('click', (event) => {
        event.stopPropagation(); // Prevent window listener from closing it immediately
        actionsDropdown.style.display = actionsDropdown.style.display === 'block' ? 'none' : 'block';
    });

    // Handle card size slider changes
    cardSizeSlider.addEventListener('input', (event) => {
        const newSize = event.target.value;
        movieListContainer.style.setProperty('--card-min-width', `${newSize}px`);
    });

    // Handle title editing
    mainTitle.addEventListener('blur', () => {
        currentTitle = mainTitle.textContent;
        saveMovieListToServer();
    });

    // Handle year selection change
    yearSelect.addEventListener('change', async (event) => {
        const selectedYear = event.target.value;
        localStorage.setItem('movieListCurrentListId', selectedYear);
        await loadMoviesForYear(selectedYear);
        renderMovieList();
    });

    // Handle Details Modal events
    closeDetailsModalBtn.addEventListener('click', () => {
        detailsModal.style.display = 'none';
    });

    detailsModal.addEventListener('click', (event) => {
        if (event.target === detailsModal) {
            detailsModal.style.display = 'none';
        }
    });

    // Handle Import List button click
    importListBtn.addEventListener('click', importMovies);

    // Handle Export to JSON button click
    exportJsonBtn.addEventListener('click', exportMoviesToJson);

    // Handle Import from JSON button click
    importJsonBtn.addEventListener('click', importMoviesFromJson);

    // Handle Create New List button click
    createListBtn.addEventListener('click', async () => {
        const year = prompt("Enter the year for the new list:", new Date().getFullYear());
        const title = prompt("Enter a title for the new list:", `New List for ${year}`);

        if (year && /^\d{4}$/.test(year) && title) {
            const uniqueId = Date.now(); // Use timestamp for a unique ID
            const listKey = `movie-list-${uniqueId}`;
            
            const newListData = {
                id: uniqueId,
                year: year,
                title: title,
                movies: []
            };
            localStorage.setItem(listKey, JSON.stringify(newListData));
            alert(`Successfully created list "${title}" for ${year}.`);
            location.reload(); // Reload to see the new list in the dropdown
        } else if (year !== null || title !== null) {
            // User didn't cancel everything
            alert("Invalid year. Please enter a 4-digit year.");
        }
    });

    // Handle Delete List button click
    deleteListBtn.addEventListener('click', async () => {
        const confirmation = confirm(`Are you sure you want to permanently delete the list "${currentTitle}"? This cannot be undone.`);
        if (confirmation) {
            try {
                const listKey = `movie-list-${currentListId}`;
                localStorage.removeItem(listKey);
                alert(`List "${currentTitle}" has been deleted.`);
                location.reload(); // Easiest way to reset the state
            } catch (error) {
                console.error('Failed to delete movie list from localStorage:', error);
                alert('Error: Could not delete the list.');
            }
        }
    });

    // Open Modal
    addMovieBtn.addEventListener('click', () => {
        searchModal.style.display = 'block';
        searchInput.focus();
    });

    // Close Modal
    closeModalBtn.addEventListener('click', () => {
        searchModal.style.display = 'none';
        searchResultsContainer.innerHTML = ''; // Clear results when closing
        searchInput.value = '';
    });

    // Close Modal when clicking outside of it
    window.addEventListener('click', (event) => {
        if (event.target === searchModal) {
            searchModal.style.display = 'none';
        }

        // Close actions dropdown if clicking outside
        if (!event.target.closest('.dropdown-menu')) {
            actionsDropdown.style.display = 'none';
        }
    });

    // Search Movie (on button click)
    searchSubmitBtn.addEventListener('click', () => {
        searchMovies(searchInput.value);
    });
    
    // Search Movie (on Enter key press)
    searchInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            searchMovies(searchInput.value);
        }
    });
    
    // Handle 'Add to List' button click within search results
    searchResultsContainer.addEventListener('click', (event) => {
        const target = event.target;
        if (target.classList.contains('add-movie-button')) {
            const tmdbId = target.dataset.tmdbId;
            addMovieToTheList(tmdbId);
        }
    });

    // Handle clicks within the main movie list container
    movieListContainer.addEventListener('click', (event) => {
        const target = event.target;
        const movieItem = event.target.closest('.movie-card, .movie-list-item');
        
        if (!movieItem) return;

        const tmdbId = Number(movieItem.dataset.tmdbId);
        if (target.classList.contains('watched-toggle-btn')) {
            // This click is on the watched button itself, so just toggle status.
            toggleWatchedStatus(tmdbId);
        } else {
            // This click is on the card/item area, so open the details modal.
            openDetailsModal(tmdbId);
        }
    });

    // Handle button clicks within the details modal
    detailsModal.addEventListener('click', (event) => {
        const target = event.target;
        const tmdbId = Number(target.dataset.tmdbId);
        if (target.classList.contains('watched-toggle-btn')) {
            toggleWatchedStatus(tmdbId);
        } else if (target.classList.contains('remove-movie-btn')) {
            removeMovieFromTheList(tmdbId);
            detailsModal.style.display = 'none'; // Close modal after removing
        }
    });

    // --- Initialization ---

    /**
     * Initializes the application by loading data and rendering the UI.
     */
    async function initializeApp() {
        console.log("[initializeApp] Starting application initialization.");
        setView(currentView); // Set initial view from localStorage
        // 1. Fetch available years and populate dropdown
        try {
            const lists = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('movie-list-')) {
                    const listData = JSON.parse(localStorage.getItem(key));
                    const listId = key.replace('movie-list-', '');
                    lists.push({ id: listId, title: listData.title || `Untitled List`, year: listData.year });
                }
            }
            lists.sort((a, b) => b.year.localeCompare(a.year) || a.title.localeCompare(b.title)); // Sort by year desc, then title asc

            if (lists.length > 0) {
                lists.forEach(list => {
                    const option = new Option(`${list.year}: ${list.title}`, list.id); // Show "YEAR: Title"
                    yearSelect.add(option);
                });
                // Restore last selected list, or default to a sensible choice.
                const savedListId = localStorage.getItem('movieListCurrentListId');
                if (savedListId && lists.some(list => list.id === savedListId)) {
                    currentListId = savedListId;
                } else if (lists.some(list => list.year === '2025')) { // Fallback to a 2025 list if one exists
                    const list2025 = lists.find(list => list.year === '2025');
                    currentListId = list2025.id;
                } else {
                    currentYear = lists[0].id;
                }
                yearSelect.value = currentYear; // Sync dropdown with the current year
                console.log(`[initializeApp] Years loaded. Defaulting to ${currentYear}.`);
            } else {
                mainTitle.textContent = "No Movie Lists Found"; // Keep this for user feedback
                console.log("[initializeApp] No movie lists found in localStorage.");
            }
        } catch (error) {
            console.error("Failed to fetch years:", error);
            mainTitle.textContent = "Error Loading Archives";
        }

        // 2. Load and render movies ONLY if a year was successfully determined
        if (currentListId) {
            console.log(`[initializeApp] Loading movies for list ID ${currentListId}...`);
            movieListContainer.style.setProperty('--card-min-width', `${cardSizeSlider.value}px`);
            await loadMoviesForYear(currentListId);
            console.log(`[initializeApp] Movie list for ${currentListId} loaded. Rendering...`);
            renderMovieList();
        }
        displayVersionNumbers();
    }

    initializeApp();
});