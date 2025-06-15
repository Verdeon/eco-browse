// Yardımcı fonksiyon: Saniye cinsinden süreyi MM:SS formatına dönüştürür
function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Karbon ve ağaç hesaplamaları
function calculateTotalCarbonForSite(carbonPerMinute, timeSpentSeconds) {
    if (isNaN(carbonPerMinute) || isNaN(timeSpentSeconds)) return 0;
    return (carbonPerMinute * timeSpentSeconds) / 60; // saniyeyi dakikaya çevir
}

function calculateTreeCount(totalCarbonGrams) {
    const co2PerTreePerYear = 22000; // Bir ağacın yılda emdiği yaklaşık CO2 miktarı (gram)
    if (totalCarbonGrams <= 0) return 0;
    return Math.ceil(totalCarbonGrams / co2PerTreePerYear); 
}

// Arayüzün sadece anlık/dinamik kısımlarını günceller
function updateCurrentSiteUI(hostname, timeSpent, carbonPerMinute) {
    if (!hostname || hostname === 'bilinmeyen-site' || hostname === '') { 
        document.getElementById('site-name').textContent = 'Bilinmeyen Site'; 
        document.getElementById('time-spent').textContent = '00:00';
        document.getElementById('current-carbon').textContent = '0.00g/dk';
        document.getElementById('site-total-carbon').textContent = '0.00g';
    } else {
        document.getElementById('site-name').textContent = hostname;
        document.getElementById('time-spent').textContent = formatTime(timeSpent || 0);
        document.getElementById('current-carbon').textContent = `${(carbonPerMinute || 0).toFixed(2)}g/dk`;

        const siteTotalCarbon = calculateTotalCarbonForSite(carbonPerMinute || 0, timeSpent || 0);
        document.getElementById('site-total-carbon').textContent = `${siteTotalCarbon.toFixed(2)}g`;
    }
}

// Arayüzün global/statik kısımlarını günceller
function updateGlobalUI(overallTotalCarbon, historyData) {
    document.getElementById('overall-total-carbon').textContent = `${(overallTotalCarbon || 0).toFixed(2)}g`;

    const treeSuggestionEl = document.getElementById('tree-suggestion');
    const treeCount = calculateTreeCount(overallTotalCarbon || 0);

    if (treeCount > 0) {
        treeSuggestionEl.innerHTML = `Bu karbon salımını telafi etmek için <strong>${treeCount} fidan</strong> dikmelisin! 🌱<br/><a href="https://tema.org.tr" target="_blank">TEMA'ya Bağlan</a>`;
    } else {
        treeSuggestionEl.innerHTML = `Harika! Henüz yüksek karbon salımına ulaşmadın. Çevreyi korumaya devam et! 🌱`;
    }

    displayHistory(historyData || {}); 
}

// Geçmişi listede gösterme (Akıllı Güncelleme)
function displayHistory(historyData) {
    const historyListEl = document.getElementById('history-list'); 

    const allEntries = [];
    for (const hostname in historyData) {
        historyData[hostname].forEach(entry => {
            allEntries.push({ hostname, ...entry });
        });
    }

    allEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const existingItemsMap = new Map();
    historyListEl.querySelectorAll('li').forEach(li => {
        const id = li.dataset.entryId; 
        if (id) {
            existingItemsMap.set(id, li);
        }
    });

    const updatedEntryIds = new Set(); 

    if (allEntries.length === 0) {
        historyListEl.innerHTML = '<li>Henüz geçmiş veri bulunmamaktadır.</li>';
        return;
    }

    allEntries.forEach(entry => {
        const entryId = `${entry.hostname}-${new Date(entry.timestamp).getTime()}`; 
        
        let listItem = existingItemsMap.get(entryId);

        if (listItem) {
            const dateSpan = listItem.querySelector('small');
            const dataSpan = listItem.querySelector('span:nth-child(2)'); 

            if (dataSpan) {
                dataSpan.textContent = `${entry.totalCarbon.toFixed(2)}g (${formatTime(entry.durationSeconds)})`;
            }
            if (dateSpan) {
                 dateSpan.textContent = new Date(entry.timestamp).toLocaleString('tr-TR', {
                    year: 'numeric', month: 'numeric', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
            }
            updatedEntryIds.add(entryId); 
        } else {
            listItem = document.createElement('li');
            listItem.dataset.entryId = entryId; 

            const date = new Date(entry.timestamp).toLocaleString('tr-TR', {
                year: 'numeric', month: 'numeric', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });

            let link = entry.hostname.replace(/^www\./, "");
            listItem.innerHTML = `
                <span class="site-name">${link}</span>
                <span class="carbon-time">${entry.totalCarbon.toFixed(2)}g (${formatTime(entry.durationSeconds)})</span>
                <small class="date">${date}</small>
            `;

            listItem.addEventListener('click', (e) => {
            e.preventDefault();
            let url = entry.hostname.startsWith('http') ? entry.hostname : `https://${entry.hostname}`;
            window.open(url, '_blank');
            });
            
            if (historyListEl.children.length === 0 || historyListEl.children[0].textContent === 'Henüz geçmiş veri bulunmamaktadır.') {
                historyListEl.innerHTML = ''; 
                historyListEl.appendChild(listItem);
            } else {
                let inserted = false;
                for (let i = 0; i < historyListEl.children.length; i++) {
                    const existingEntryTime = parseInt(historyListEl.children[i].dataset.entryId.split('-')[1]);
                    if (new Date(entry.timestamp).getTime() > existingEntryTime) {
                        historyListEl.insertBefore(listItem, historyListEl.children[i]);
                        inserted = true;
                        break;
                    }
                }
                if (!inserted) {
                    historyListEl.appendChild(listItem); 
                }
            }
            updatedEntryIds.add(entryId); 
        }
    });

    existingItemsMap.forEach((li, id) => {
        if (!updatedEntryIds.has(id)) {
            li.remove();
        }
    });
}

// Hostname'i olduğu gibi döndürür, hiçbir değişiklik yapmaz.
function cleanHostnameForPopup(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname; 
    } catch (e) {
        console.error("cleanHostnameForPopup hatası (URL çözümlenemedi):", e);
        return "bilinmeyen-site";
    }
}


// Popup açıldığında ilk veriyi al
document.addEventListener('DOMContentLoaded', () => {

      const historyList = document.getElementById("history-list");
  const clearBtn = document.getElementById("clear-history-btn");

  // Geçmiş elemanlarına tıklanınca yönlendirme
  historyList.addEventListener("click", (e) => {
    if (e.target.tagName === "LI") {
      const url = e.target.getAttribute("data-url");
      if (url) window.open(url, "_blank");
    }
  });

  // Geçmişi temizlemeden önce onay kutusu
  clearBtn.addEventListener("click", () => {
    const modal = document.getElementById("confirm-modal");
    modal.style.display = "flex";
  });

  document.getElementById("modal-cancel").addEventListener("click", () => {
    document.getElementById("confirm-modal").style.display = "none";
  });

  document.getElementById("modal-confirm").addEventListener("click", () => {
            chrome.runtime.sendMessage({ action: "clearHistory" }, (response) => {
                if (response && response.success) {
                    updateGlobalUI(0, {}); 
                }
            });
    document.getElementById("confirm-modal").style.display = "none";
  });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        let currentHostname = null;

        if (currentTab && currentTab.url) {
            if (currentTab.url.startsWith('http://') || currentTab.url.startsWith('https://')) {
                currentHostname = cleanHostnameForPopup(currentTab.url); 
            } else {
                currentHostname = null; 
            }
        }
        
        chrome.runtime.sendMessage({ action: "getInitialData", hostname: currentHostname }, (response) => {
            if (response) {
                updateCurrentSiteUI(response.hostname, response.timeSpent, response.carbonPerMinute);
                updateGlobalUI(response.overallTotalCarbon, response.history);
            } else {
                console.error("Popup: background.js'ten veri alınamadı veya response boş.");
                updateCurrentSiteUI(null, 0, 0); 
                updateGlobalUI(0, {});
            }
        });
    });

    // Background script'ten gelen anlık güncellemeleri dinle
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "updatePopup") {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const currentTabUrl = tabs[0] && tabs[0].url;
                let currentTabCleanedHostname = null;
                if (currentTabUrl && (currentTabUrl.startsWith('http://') || currentTabUrl.startsWith('https://'))) {
                    currentTabCleanedHostname = cleanHostnameForPopup(currentTabUrl);
                }

                if (currentTabCleanedHostname === request.hostname) {
                    updateCurrentSiteUI(request.hostname, request.timeSpent, request.carbonPerMinute); 
                    
                    // Bu kısım, geçmişin güncellenmesi isteği üzerine burada bırakıldı.
                    // Her saniye çağrılması performans sorunlarına yol açabilir.
                    // Eğer geçmişin bu kadar sık güncellenmesi kritik değilse, bu kısmı kaldırabiliriz.
                    // Ancak şimdilik akıllı displayHistory'ye güveniyoruz.
                    chrome.runtime.sendMessage({ action: "getInitialData", hostname: request.hostname }, (response) => {
                         if (response) {
                             updateGlobalUI(response.overallTotalCarbon, response.history);
                         }
                    });
                }
            });
        }
    });

    // Carbon Fact
    const carbonFacts = [
        "Bir e-posta göndermek ortalama 4g CO₂ salımına neden olur.",
        "Bir web sayfası ziyareti ortalama 0.5g CO₂ salımına neden olur.",
        "Video akışı, web'deki en büyük karbon ayak izine sahip aktivitelerden biridir.",
        "Dijital ayak izini azaltmak için gereksiz sekmeleri kapatın.",
        "Daha yeşil barındırma hizmeti kullanan web sitelerini tercih edin."
    ];

    function displayCarbonFact() {
        const factTextEl = document.getElementById("fact-text");
        if (factTextEl) {
            const randomIndex = Math.floor(Math.random() * carbonFacts.length);
            factTextEl.textContent = carbonFacts[randomIndex];
        }
    }
    displayCarbonFact(); 
    setInterval(displayCarbonFact, 30000); 
});

const toggleBtn = document.getElementById("history-toggle");
const wrapper = document.getElementById("history-wrapper");

toggleBtn.addEventListener("click", () => {
  const isCollapsed = wrapper.classList.toggle("collapsed");
  
  toggleBtn.innerText = isCollapsed
    ? "📜 Geçmiş Karbon Verileri ⬇️"
    : "📜 Geçmiş Karbon Verileri ⬆️";
});