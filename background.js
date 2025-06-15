const CARBON_PER_MINUTE_DEFAULT = 0.5; // Varsayılan g CO2/dk
const CARBON_PER_MINUTE_HIGH_TRAFFIC = 1.2; // Yeşil olmayan veya yüksek trafikli siteler için
const CARBON_PER_MINUTE_LOW_TRAFFIC = 0.2;  // Yeşil veya düşük trafikli siteler için

// Bu liste artık dinamik olarak API ile güncellenecek, bu sadece bir yedek/tahmin listesidir.
const siteCarbonEstimates = {
    "www.google.com": 0.8,
    "mail.google.com": 0.6,
    "www.youtube.com": 1.5,
    "www.facebook.com": 1.2,
    "twitter.com": 0.7,
    "www.wikipedia.org": 0.3,
    "www.amazon.com": 1.0,
    "www.netflix.com": 1.8,
    "github.com": 0.6,
};

// Aktif siteler ve her birinde geçirilen süre (saniye)
const activeSiteDurations = {}; // { "hostname": saniye }
let currentActiveHostname = null;
let currentTabId = null;
let timerIntervalId = null;

// Chrome depolama anahtarları
const STORAGE_KEYS = {
    HISTORY: 'carbonHistory',
    OVERALL_TOTAL_CARBON: 'overallTotalCarbon',
    GREEN_WEB_CACHE: 'greenWebCache' // Yeni: Green Web API önbelleği
};

// YENİ: Green Web API önbellekleme süresi (24 saat = 24 * 60 * 60 * 1000 ms)
const CACHE_LIFETIME = 24 * 60 * 60 * 1000; 

// Hostname'i olduğu gibi döndürür, hiçbir değişiklik yapmaz.
function cleanHostname(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname; 
    } catch (e) {
        console.error("cleanHostname hatası (URL çözümlenemedi):", e);
        return "bilinmeyen-site"; 
    }
}

/**
 * The Green Web Foundation API'sini kullanarak bir sitenin yeşil olup olmadığını kontrol eder.
 * Yanıtları önbelleğe alır.
 * @param {string} hostname Kontrol edilecek hostname (örn: "google.com")
 * @returns {Promise<boolean|null>} Yeşilse true, değilse false, hata durumunda null döner.
 */
async function checkGreenWebStatus(hostname) {
    let cache = (await chrome.storage.local.get(STORAGE_KEYS.GREEN_WEB_CACHE))[STORAGE_KEYS.GREEN_WEB_CACHE] || {};

    // Önbellekte geçerli bir kayıt var mı kontrol et
    if (cache[hostname] && (Date.now() - cache[hostname].timestamp < CACHE_LIFETIME)) {
        console.log(`BG: ${hostname} için Green Web verisi önbellekten geldi (yeşil: ${cache[hostname].isGreen})`);
        return cache[hostname].isGreen;
    }

    // Önbellekte yoksa veya eskimişse API'ye istek gönder
    try {
        console.log(`BG: ${hostname} için Green Web API'sine istek gönderiliyor.`);
        const response = await fetch(`https://api.thegreenwebfoundation.org/greencheck/${hostname}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`BG: Green Web API HTTP hatası! Durum: ${response.status}, Mesaj: ${errorText}`);
            return null; // Hata durumunda null döndür
        }

        const data = await response.json();
        const isGreen = data.green || false; // `green` alanı yoksa varsayılan olarak false kabul et

        // Sonucu önbelleğe al
        cache[hostname] = {
            isGreen: isGreen,
            timestamp: Date.now()
        };
        await chrome.storage.local.set({ [STORAGE_KEYS.GREEN_WEB_CACHE]: cache });
        console.log(`BG: ${hostname} için Green Web verisi API'den alındı ve önbelleğe alındı (yeşil: ${isGreen})`);
        return isGreen;

    } catch (error) {
        console.error(`BG: Green Web API isteği sırasında hata oluştu: ${error}`);
        return null; // Hata durumunda null döndür
    }
}


async function getEstimatedCarbonPerMinute(hostname) {
  const cacheKey = `carbonCache_${hostname}`;
  const cache = (await chrome.storage.local.get(cacheKey))[cacheKey];

  // Önbellekte varsa ve 24 saatten eski değilse kullan
  if (cache && (Date.now() - cache.timestamp < 24 * 60 * 60 * 1000)) {
    return cache.carbonPerMinute;
  }

  // API'den veri al
  try {
    const response = await fetch(`https://api.websitecarbon.com/site?url=https://${hostname}`);
    if (!response.ok) throw new Error(`Website Carbon API hata: ${response.status}`);
    const data = await response.json();

    const gramsPerPageLoad = data.carbon.grams || 0;
    const carbonPerMinute = gramsPerPageLoad / 2; // Ortalama ziyaret süresi 2 dk

    // Önbelleğe yaz
    await chrome.storage.local.set({
      [cacheKey]: {
        carbonPerMinute,
        timestamp: Date.now()
      }
    });

    return carbonPerMinute;

  } catch (error) {
    console.error("Website Carbon API hatası:", error);

    // Hata olursa yedek değerlere dön
    if (siteCarbonEstimates[hostname]) return siteCarbonEstimates[hostname];
    return CARBON_PER_MINUTE_DEFAULT;
  }
}

// Toplam karbonu kaydetme
async function saveOverallTotalCarbon(carbonAmount) {
    let currentTotal = (await chrome.storage.local.get(STORAGE_KEYS.OVERALL_TOTAL_CARBON))[STORAGE_KEYS.OVERALL_TOTAL_CARBON] || 0;
    currentTotal += carbonAmount;
    await chrome.storage.local.set({ [STORAGE_KEYS.OVERALL_TOTAL_CARBON]: currentTotal });
}

// Geçmişe karbon verisi ekleme
async function addCarbonToHistory(hostname, carbonPerMinute, durationSeconds) {
    // Hostname geçerli değilse veya karbon 0 ise kaydetme
    if (!hostname || hostname === 'bilinmeyen-site' || carbonPerMinute === 0) {
        return;
    }

    const totalCarbonForThisVisit = (carbonPerMinute * durationSeconds) / 60; 

    let history = (await chrome.storage.local.get(STORAGE_KEYS.HISTORY))[STORAGE_KEYS.HISTORY] || {};
    
    if (!history[hostname]) {
        history[hostname] = [];
    }
    
    const lastEntry = history[hostname].length > 0 ? history[hostname][history[hostname].length - 1] : null;
    const now = Date.now();
    
    if (lastEntry && (now - new Date(lastEntry.timestamp).getTime()) < 60000) { 
        lastEntry.totalCarbon += totalCarbonForThisVisit;
        lastEntry.durationSeconds += durationSeconds;
        lastEntry.timestamp = new Date().toISOString(); 
    } else {
        history[hostname].push({
            timestamp: new Date().toISOString(),
            carbonPerMinute: carbonPerMinute, 
            durationSeconds: durationSeconds,
            totalCarbon: totalCarbonForThisVisit 
        });
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: history });
    await saveOverallTotalCarbon(totalCarbonForThisVisit); 
}

function startTimer() {
    if (timerIntervalId) clearInterval(timerIntervalId);
    
    timerIntervalId = setInterval(async () => {
        if (currentActiveHostname) {
            activeSiteDurations[currentActiveHostname] = (activeSiteDurations[currentActiveHostname] || 0) + 1;
            
            // Burası async olduğu için getEstimatedCarbonPerMinute'ı await ile çağırıyoruz
            const carbonPerMinute = await getEstimatedCarbonPerMinute(currentActiveHostname);
            await addCarbonToHistory(currentActiveHostname, carbonPerMinute, 1); 
            
            chrome.runtime.sendMessage({
                action: "updatePopup",
                hostname: currentActiveHostname,
                timeSpent: activeSiteDurations[currentActiveHostname],
                carbonPerMinute: carbonPerMinute 
            }).catch(e => { /* Console'a hata basmaması için catch eklendi */ });
        }
    }, 1000); 
    console.log("BG: Zamanlayıcı başlatıldı.");
}

function stopTimer() {
    if (timerIntervalId) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
    }
    console.log("BG: Zamanlayıcı durduruldu.");
}

// Sekme değiştiğinde
chrome.tabs.onActivated.addListener(activeInfo => {
    chrome.tabs.get(activeInfo.tabId, async tab => { 
        if (tab && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) { 
            currentTabId = activeInfo.tabId; 
            const newHostname = cleanHostname(tab.url); 
            
            if (newHostname !== currentActiveHostname) {
                currentActiveHostname = newHostname; 
            }
            await getEstimatedCarbonPerMinute(currentActiveHostname);

            console.log(`BG: Sekme değişti. Aktif hostname: ${currentActiveHostname}`);
            startTimer(); 
        } else {
            currentActiveHostname = null; 
            stopTimer(); 
        }
    });
});

// Sekme URL'si güncellendiğinde
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tabId === currentTabId && changeInfo.status === 'complete' && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        const newHostname = cleanHostname(tab.url);
        if (newHostname !== currentActiveHostname) {
            currentActiveHostname = newHostname;
            getEstimatedCarbonPerMinute(currentActiveHostname).then(() => {
                console.log(`BG: URL güncellendi. Aktif hostname: ${currentActiveHostname}`);
                startTimer();
            });
        }
    }
});

// Pencere odağı değiştiğinde
chrome.windows.onFocusChanged.addListener(windowId => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        stopTimer();
        console.log("BG: Pencere odağı kaybedildi, zamanlayıcı durduruldu.");
    } else {
        chrome.tabs.query({ active: true, currentWindow: true }, async tabs => { 
            if (tabs[0] && tabs[0].url && (tabs[0].url.startsWith('http://') || tabs[0].url.startsWith('https://'))) {
                currentTabId = tabs[0].id;
                const newHostname = cleanHostname(tabs[0].url);
                if (newHostname !== currentActiveHostname) { 
                    currentActiveHostname = newHostname;
                }
                console.log(`BG: Pencere odaklandı. Aktif hostname: ${currentActiveHostname}`);
                startTimer();
            } else {
                currentActiveHostname = null;
                stopTimer();
            }
        });
    }
});

// Uzantıdan gelen mesajları dinleme (popup'tan veya content script'ten)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Mesaj işleyicisinin senkron çalışabilmesi için asenkron kısımları bir IIFE içine alıyoruz
    (async () => {
        switch (request.action) {
            case "getInitialData":
                const requestedHostname = request.hostname || currentActiveHostname;
                const timeSpent = activeSiteDurations[requestedHostname] || 0; 
                const carbonPerMinute = await getEstimatedCarbonPerMinute(requestedHostname);
                
                chrome.storage.local.get([STORAGE_KEYS.HISTORY, STORAGE_KEYS.OVERALL_TOTAL_CARBON], (result) => {
                    sendResponse({
                        hostname: requestedHostname,
                        timeSpent: timeSpent,
                        carbonPerMinute: carbonPerMinute,
                        history: result[STORAGE_KEYS.HISTORY] || {},
                        overallTotalCarbon: result[STORAGE_KEYS.OVERALL_TOTAL_CARBON] || 0
                    });
                });
                break; // Switch case'i sonlandır

            case "clearHistory":
                chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: {}, [STORAGE_KEYS.OVERALL_TOTAL_CARBON]: 0, [STORAGE_KEYS.GREEN_WEB_CACHE]: {} }, () => { 
                    for (const hostname in activeSiteDurations) {
                        delete activeSiteDurations[hostname]; 
                    }
                    console.log("BG: Geçmiş, toplam karbon ve aktif site süreleri temizlendi.");
                    sendResponse({ success: true }); 
                });
                break; // Switch case'i sonlandır
        }
    })(); // IIFE'yi çağır
    return true; // Asenkron yanıt göndereceğimizi belirtir
});

// Uzantı yüklendiğinde veya güncellendiğinde
chrome.runtime.onInstalled.addListener(() => {
    console.log("EcoBrowse+ yüklendi veya güncellendi.");
    chrome.tabs.query({ active: true, currentWindow: true }, async tabs => { 
        if (tabs[0] && (tabs[0].url.startsWith('http://') || tabs[0].url.startsWith('https://'))) {
            currentTabId = tabs[0].id;
            currentActiveHostname = cleanHostname(tabs[0].url);
            startTimer();
        }
    });
});

setInterval(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, async tabs => {
        if (tabs[0] && tabs[0].url && (tabs[0].url.startsWith('http://') || tabs[0].url.startsWith('https://'))) {
            const newHostname = cleanHostname(tabs[0].url);
            if (newHostname !== currentActiveHostname) {
                currentActiveHostname = newHostname;
                await getEstimatedCarbonPerMinute(currentActiveHostname);
                startTimer();
                console.log(`BG: Arka planda hostname değişimi algılandı: ${currentActiveHostname}`);
            }
        }
    });
}, 5000);

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.type === "urlChanged" && message.url) {
        const newHostname = cleanHostname(message.url);
        if (newHostname !== currentActiveHostname) {
            currentActiveHostname = newHostname;
            await getEstimatedCarbonPerMinute(currentActiveHostname);
            startTimer();
            console.log(`BG: content.js'ten gelen yönlendirme algılandı: ${currentActiveHostname}`);
        }
    }
});