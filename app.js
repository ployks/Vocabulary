document.addEventListener('DOMContentLoaded', () => {
    const wordInput = document.getElementById('wordInput');
    const translateBtn = document.getElementById('translateBtn');
    const loading = document.getElementById('loading');
    const resultCard = document.getElementById('resultCard');
    const resultWord = document.getElementById('resultWord');
    const resultMeaning = document.getElementById('resultMeaning');
    const manualMeaning = document.getElementById('manualMeaning');
    const editBtn = document.getElementById('editBtn');
    const saveBtn = document.getElementById('saveBtn');
    const alphabetNav = document.getElementById('alphabetNav');
    const vocabTbody = document.getElementById('vocabTbody');
    const emptyState = document.getElementById('emptyState');
    const vocabTable = document.getElementById('vocabTable');
    const autocompleteDropdown = document.getElementById('autocompleteDropdown');
    const didYouMeanBox = document.getElementById('didYouMeanBox');
    const didYouMeanWord = document.getElementById('didYouMeanWord');
    const speakBtn = document.getElementById('speakBtn');

    let isEditing = false;
    let currentActiveLetter = 'All';
    
    // Load vocabularies from localStorage
    // Structure: { "word1": "meaning1" }
    let vocabData = JSON.parse(localStorage.getItem('vocabVault')) || {};

    // Initialize Alphabet Navigation
    initAlphabetNav();
    renderTable();

    // Event Listeners
    translateBtn.addEventListener('click', handleTranslate);
    
    function speakWord(word) {
        if (!word) return;
        
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();
        
        try {
            // Wake up Bluetooth headset with a completely silent audio ping
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                const ctx = new AudioCtx();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                
                // Set volume to 0 (silent)
                gain.gain.value = 0;
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                
                // Play for 0.1 seconds
                osc.start(0);
                osc.stop(ctx.currentTime + 0.1);
                
                // Wait 400ms for Bluetooth hardware to fully wake up, then speak
                setTimeout(() => {
                    const msg = new SpeechSynthesisUtterance(word);
                    msg.lang = 'en-US';
                    window.speechSynthesis.speak(msg);
                }, 400);
                return;
            }
        } catch (e) {
            console.error('Audio context error:', e);
        }
        
        // Fallback for browsers without AudioContext
        const msg = new SpeechSynthesisUtterance(word);
        msg.lang = 'en-US';
        window.speechSynthesis.speak(msg);
    }

    if (speakBtn) {
        speakBtn.addEventListener('click', () => {
            speakWord(resultWord.textContent);
        });
    }

    wordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            autocompleteDropdown.classList.add('hidden');
            handleTranslate();
        }
    });

    // Debounce function for autocomplete
    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), delay);
        };
    }

    // JSONP Autocomplete Fetcher
    function fetchAutocomplete(query) {
        return new Promise((resolve) => {
            const script = document.createElement('script');
            const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
            window[callbackName] = function(data) {
                delete window[callbackName];
                document.body.removeChild(script);
                resolve(data[1] ? data[1].map(i => i[0]) : []);
            };
            script.src = `https://suggestqueries.google.com/complete/search?client=youtube&q=${encodeURIComponent(query)}&jsonp=${callbackName}`;
            document.body.appendChild(script);
        });
    }

    // Handle Input for Autocomplete
    wordInput.addEventListener('input', debounce(async (e) => {
        const query = e.target.value.trim();
        if (!query) {
            autocompleteDropdown.classList.add('hidden');
            return;
        }

        try {
            const suggestions = await fetchAutocomplete(query);
            if (suggestions.length > 0) {
                const topSuggestions = suggestions.slice(0, 4);
                autocompleteDropdown.innerHTML = '';
                
                // Fetch translations for suggestions concurrently
                const suggestionsWithTranslations = await Promise.all(
                    topSuggestions.map(async (sugg) => {
                        try {
                            const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=th&dt=t&q=${encodeURIComponent(sugg)}`);
                            const data = await res.json();
                            const trans = (data && data[0] && data[0][0]) ? data[0][0][0] : '';
                            return { word: sugg, trans: trans };
                        } catch(err) {
                            return { word: sugg, trans: '' };
                        }
                    })
                );

                autocompleteDropdown.innerHTML = '';
                suggestionsWithTranslations.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    
                    const wordSpan = document.createElement('div');
                    wordSpan.className = 'sugg-word';
                    wordSpan.textContent = item.word;
                    
                    const transSpan = document.createElement('div');
                    transSpan.className = 'sugg-trans';
                    transSpan.textContent = item.trans;

                    div.appendChild(wordSpan);
                    if (item.trans && item.trans.toLowerCase() !== item.word.toLowerCase()) {
                        div.appendChild(transSpan);
                    }

                    div.onclick = () => {
                        wordInput.value = item.word;
                        autocompleteDropdown.classList.add('hidden');
                        handleTranslate();
                    };
                    autocompleteDropdown.appendChild(div);
                });
                autocompleteDropdown.classList.remove('hidden');
            } else {
                autocompleteDropdown.classList.add('hidden');
            }
        } catch (error) {
            console.error('Autocomplete error:', error);
            autocompleteDropdown.classList.add('hidden');
        }
    }, 400));

    // Hide dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!wordInput.contains(e.target) && !autocompleteDropdown.contains(e.target)) {
            autocompleteDropdown.classList.add('hidden');
        }
    });

    editBtn.addEventListener('click', () => {
        if (!isEditing) {
            manualMeaning.value = resultMeaning.textContent;
            manualMeaning.classList.remove('hidden');
            resultMeaning.classList.add('hidden');
            editBtn.textContent = 'Apply';
        } else {
            resultMeaning.textContent = manualMeaning.value || 'No meaning provided';
            manualMeaning.classList.add('hidden');
            resultMeaning.classList.remove('hidden');
            editBtn.textContent = 'Edit';
        }
        isEditing = !isEditing;
    });

    saveBtn.addEventListener('click', () => {
        let word = resultWord.textContent.trim();
        let meaning = resultMeaning.textContent.trim();
        
        if (isEditing) {
            meaning = manualMeaning.value.trim() || meaning;
            // auto-apply edit if saving while editing
            resultMeaning.textContent = meaning;
            manualMeaning.classList.add('hidden');
            resultMeaning.classList.remove('hidden');
            editBtn.textContent = 'Edit';
            isEditing = false;
        }

        if (word && meaning) {
            // Capitalize first letter for word storage consistency
            word = word.charAt(0).toUpperCase() + word.slice(1);
            
            vocabData[word] = meaning;
            localStorage.setItem('vocabVault', JSON.stringify(vocabData));
            
            // Switch to the letter of the saved word
            const firstLetter = word.charAt(0).toUpperCase();
            if (firstLetter >= 'A' && firstLetter <= 'Z') {
                currentActiveLetter = firstLetter;
                updateActiveNav();
            }
            
            renderTable();
            
            // Reset input and hide result
            wordInput.value = '';
            resultCard.classList.add('hidden');
        }
    });

    async function handleTranslate() {
        const word = wordInput.value.trim();
        if (!word) return;

        // Reset UI
        resultCard.classList.add('hidden');
        loading.classList.remove('hidden');
        isEditing = false;
        manualMeaning.classList.add('hidden');
        resultMeaning.classList.remove('hidden');
        editBtn.textContent = 'Edit';

        try {
            // Using Google Translate URL (free tier API) with dj=1 to get full JSON payload
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=th&dt=t&dt=qc&dj=1&q=${encodeURIComponent(word)}`;
            const response = await fetch(url);
            const data = await response.json();

            loading.classList.add('hidden');
            didYouMeanBox.classList.add('hidden');
            
            if (data && data.sentences && data.sentences.length > 0) {
                // Formatting
                const formattedWord = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                const translated = data.sentences[0].trans;
                
                // Show "Did you mean" if spelling correction exists
                if (data.spell && data.spell.spell_res) {
                    const correctedWord = data.spell.spell_res.replace(/<\/?[^>]+(>|$)/g, ""); // Strip HTML tags like <b><i>
                    didYouMeanWord.textContent = correctedWord;
                    didYouMeanBox.classList.remove('hidden');
                    didYouMeanWord.onclick = () => {
                        wordInput.value = correctedWord;
                        handleTranslate();
                    };
                }

                // If translation didn't work and returned the English word back
                if (translated.toLowerCase() === word.toLowerCase() && !/[ก-๙]/.test(translated)) {
                    showManualEntry(formattedWord, 'Translation not found. Enter manually...');
                } else {
                    resultWord.textContent = formattedWord;
                    resultMeaning.textContent = translated;
                    resultCard.classList.remove('hidden');
                }
            } else {
                showManualEntry(word);
            }
        } catch (error) {
            console.error('Translation error:', error);
            loading.classList.add('hidden');
            showManualEntry(word, 'Translation failed. Please enter manually.');
        }
    }

    function showManualEntry(word, placeholder = 'Enter meaning manually...') {
        resultWord.textContent = word;
        resultMeaning.textContent = '';
        manualMeaning.value = '';
        manualMeaning.placeholder = placeholder;
        
        manualMeaning.classList.remove('hidden');
        resultMeaning.classList.add('hidden');
        editBtn.textContent = 'Apply';
        isEditing = true;
        
        resultCard.classList.remove('hidden');
    }

    function initAlphabetNav() {
        alphabetNav.innerHTML = '';
        // Add 'All' button
        const allBtn = document.createElement('button');
        allBtn.className = `alpha-btn ${currentActiveLetter === 'All' ? 'active' : ''}`;
        allBtn.textContent = 'All';
        allBtn.onclick = () => {
            currentActiveLetter = 'All';
            updateActiveNav();
            renderTable();
        };
        alphabetNav.appendChild(allBtn);

        for (let i = 65; i <= 90; i++) {
            const letter = String.fromCharCode(i);
            const btn = document.createElement('button');
            btn.className = `alpha-btn ${currentActiveLetter === letter ? 'active' : ''}`;
            btn.textContent = letter;
            btn.onclick = () => {
                currentActiveLetter = letter;
                updateActiveNav();
                renderTable();
            };
            alphabetNav.appendChild(btn);
        }
    }

    function updateActiveNav() {
        document.querySelectorAll('.alpha-btn').forEach(btn => {
            if (btn.textContent === currentActiveLetter) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    function renderTable() {
        vocabTbody.innerHTML = '';
        
        // Convert to array and sort
        const entries = Object.entries(vocabData).sort((a, b) => a[0].localeCompare(b[0]));
        
        // Filter by active letter
        const filteredEntries = entries.filter(([word]) => {
            if (currentActiveLetter === 'All') return true;
            return word.toUpperCase().startsWith(currentActiveLetter);
        });

        if (filteredEntries.length === 0) {
            vocabTable.classList.add('hidden');
            emptyState.classList.remove('hidden');
        } else {
            vocabTable.classList.remove('hidden');
            emptyState.classList.add('hidden');
            
            filteredEntries.forEach(([word, meaning]) => {
                const tr = document.createElement('tr');
                
                const tdWord = document.createElement('td');
                tdWord.className = 'word-cell';
                
                const wordText = document.createElement('span');
                wordText.textContent = word;
                
                const tableSpeakBtn = document.createElement('button');
                tableSpeakBtn.innerHTML = '🔊';
                tableSpeakBtn.className = 'table-speak-btn';
                tableSpeakBtn.title = 'Listen to pronunciation';
                tableSpeakBtn.onclick = () => {
                    speakWord(word);
                };
                
                tdWord.appendChild(wordText);
                tdWord.appendChild(tableSpeakBtn);
                
                const tdMeaning = document.createElement('td');
                tdMeaning.textContent = meaning;
                
                const tdAction = document.createElement('td');
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn-danger';
                deleteBtn.textContent = 'Delete';
                deleteBtn.onclick = () => {
                    // Removed window.confirm to avoid browser blocking the native dialog
                    delete vocabData[word];
                    localStorage.setItem('vocabVault', JSON.stringify(vocabData));
                    renderTable();
                };
                tdAction.appendChild(deleteBtn);
                
                tr.appendChild(tdWord);
                tr.appendChild(tdMeaning);
                tr.appendChild(tdAction);
                
                vocabTbody.appendChild(tr);
            });
        }
    }
});
