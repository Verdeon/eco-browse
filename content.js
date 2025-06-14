const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }
`;
document.head.appendChild(style);

const suggestionContainer = document.createElement('div');
suggestionContainer.id = 'carbon-suggestion-container';
suggestionContainer.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background-color: #ffcdcd; /* Kırmızımsı arka plan */
    color: #850404; /* Koyu kırmızı yazı */
    border: 1px solid #ee3636; /* Kırmızı kenarlık */
    padding: 15px;
    z-index: 10000;
    border-radius: 8px;
    font-size: 0.9em;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    animation: slideIn 0.5s ease-out; /* Giriş animasyonu */
    max-width: 400px;
    display: none; /* Başlangıçta gizli */
`;
document.body.appendChild(suggestionContainer);

function showCarbonSuggestion(carbonPerMinute, alternatives) {
    suggestionContainer.innerHTML = `Bu sitede dk başına ${carbonPerMinute.toFixed(2)}g CO₂ salınımı tespit edildi. <br/> Öneriler: ${alternatives.map(alt => `<br> - ${alt}`).join('')}`;
    suggestionContainer.style.display = 'block';

    setTimeout(() => {
        suggestionContainer.style.animation = 'fadeOut 0.5s ease-out forwards'; 
        setTimeout(() => {
            suggestionContainer.style.display = 'none';
            suggestionContainer.style.animation = 'none'; // Animasyonu sıfırla
        }, 500); 
    }, 8000); 
}