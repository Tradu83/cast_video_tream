// Service Worker để thêm headers vào tất cả requests (bao gồm HLS streams)
// Điều này cho phép thêm headers vào HLS manifest và segments

const CACHE_NAME = 'cast-receiver-v1';

// Hàm xác định headers dựa trên URL
function getHeadersForUrl(url) {
    const headers = {};
    
    // Xác định Referer và Origin dựa trên domain
    if (url.includes("xlz.livecdnem.com") || 
        url.includes("fast5cdn.net") ||
        url.includes("procdnlive.com")) {
        headers['Referer'] = 'https://xlz.livecdnem.com/';
        headers['Origin'] = 'https://xlz.livecdnem.com';
    } else {
        headers['Referer'] = 'https://peepoople.com/';
        headers['Origin'] = 'https://peepoople.com';
    }
    
    // Thêm các headers chung
    headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    headers['Accept'] = '*/*';
    headers['Accept-Language'] = 'en-US,en;q=0.9,vi;q=0.8';
    headers['Accept-Encoding'] = 'identity';
    headers['Connection'] = 'keep-alive';
    headers['Cache-Control'] = 'no-cache';
    headers['Pragma'] = 'no-cache';
    headers['X-Requested-With'] = 'XMLHttpRequest';
    
    return headers;
}

// Install event - đăng ký service worker
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    self.skipWaiting(); // Activate ngay lập tức
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim(); // Take control of all pages immediately
});

// Fetch event - intercept tất cả network requests
self.addEventListener('fetch', (event) => {
    const url = event.request.url;
    
    // Chỉ xử lý các requests đến video/CDN domains
    const isVideoRequest = url.includes('.m3u8') || 
                          url.includes('.ts') || 
                          url.includes('.mp4') ||
                          url.includes('.webm') ||
                          url.includes('xlz.livecdnem.com') ||
                          url.includes('fast5cdn.net') ||
                          url.includes('procdnlive.com') ||
                          url.includes('peepoople.com');
    
    if (!isVideoRequest) {
        // Không phải video request, pass through bình thường
        return;
    }
    
    console.log('Service Worker intercepting request:', url);
    
    // Lấy headers dựa trên URL
    const customHeaders = getHeadersForUrl(url);
    
    // Tạo request mới với headers
    const headers = new Headers();
    
    // Copy headers từ request gốc (trừ những headers sẽ override)
    const originalHeaders = event.request.headers;
    originalHeaders.forEach((value, key) => {
        // Không copy các headers sẽ được override
        if (!customHeaders.hasOwnProperty(key)) {
            headers.append(key, value);
        }
    });
    
    // Thêm custom headers
    Object.keys(customHeaders).forEach((key) => {
        headers.set(key, customHeaders[key]);
    });
    
    // Tạo request mới với headers
    const modifiedRequest = new Request(url, {
        method: event.request.method,
        headers: headers,
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-cache',
        redirect: 'follow'
    });
    
    console.log('Modified request with headers:', Object.fromEntries(headers.entries()));
    
    // Fetch với request đã được modify
    event.respondWith(
        fetch(modifiedRequest)
            .then((response) => {
                // Kiểm tra response
                if (!response.ok) {
                    console.error('Fetch failed:', response.status, response.statusText);
                }
                
                // Clone response để có thể đọc nhiều lần
                const responseToCache = response.clone();
                
                // Cache response (optional, có thể bỏ qua cho live streams)
                // Chỉ cache nếu không phải HLS live stream
                if (!url.includes('.m3u8') && !url.includes('.ts')) {
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                
                return response;
            })
            .catch((error) => {
                console.error('Fetch error:', error);
                // Fallback: thử fetch không có headers
                console.log('Fallback: trying without custom headers');
                return fetch(event.request);
            })
    );
});

// Message event - để nhận messages từ main thread
self.addEventListener('message', (event) => {
    console.log('Service Worker received message:', event.data);
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

console.log('Service Worker loaded and ready');

