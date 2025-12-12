// Service Worker để thêm headers vào tất cả requests (bao gồm HLS streams)

const CACHE_NAME = 'cast-receiver-v1';

// --- HÀM TIỆN ÍCH ---

/**
 * Hàm xác định headers cần thiết dựa trên URL.
 * @param {string} url - URL của request.
 * @returns {object} - Object chứa các custom header.
 */
function getHeadersForUrl(url) {
    const headers = {};
    const urlLower = url.toLowerCase();
    
    // Xác định Referer và Origin dựa trên domain
    if (urlLower.includes("xlz.livecdnem.com") || 
        urlLower.includes("fast5cdn.net") ||
        urlLower.includes("procdnlive.com")) {
        // Đây là các domain yêu cầu Referer cụ thể
        headers['Referer'] = 'https://xlz.livecdnem.com/';
        headers['Origin'] = 'https://xlz.livecdnem.com';
    } else {
        // Referer/Origin mặc định (Ví dụ: cho các luồng không yêu cầu xác thực)
        headers['Referer'] = 'https://peepoople.com/';
        headers['Origin'] = 'https://peepoople.com';
    }
    
    // Thêm các headers chung để giả lập trình duyệt
    headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    headers['Accept'] = '*/*';
    headers['Accept-Language'] = 'en-US,en;q=0.9,vi;q=0.8';
    headers['Accept-Encoding'] = 'identity'; // Quan trọng để nhận được dữ liệu không nén
    headers['Connection'] = 'keep-alive';
    headers['Cache-Control'] = 'no-cache';
    headers['Pragma'] = 'no-cache';
    // Xóa X-Requested-With vì đôi khi nó gây lỗi CORS
    
    return headers;
}

// --- XỬ LÝ SỰ KIỆN SERVICE WORKER ---

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
    const urlLower = url.toLowerCase();
    
    // Chỉ xử lý các requests liên quan đến media
    const isMediaRequest = urlLower.includes('.m3u8') || 
                          urlLower.includes('.ts') || 
                          urlLower.includes('.mp4') ||
                          urlLower.includes('.webm') ||
                          urlLower.includes('.mpd') ||
                          urlLower.includes('xlz.livecdnem.com') ||
                          urlLower.includes('fast5cdn.net') ||
                          urlLower.includes('procdnlive.com') ||
                          urlLower.includes('peepoople.com');
    
    if (!isMediaRequest) {
        // Không phải media request, pass through bình thường
        return;
    }
    
    console.log('--- SW Intercepting Media Request ---');
    console.log('URL:', url);
    
    // Lấy headers dựa trên URL
    const customHeaders = getHeadersForUrl(url);
    
    // Tạo request mới với headers
    const headers = new Headers(event.request.headers);
    
    // Ghi đè các custom headers
    Object.keys(customHeaders).forEach((key) => {
        headers.set(key, customHeaders[key]);
    });
    
    const modifiedRequest = new Request(url, {
        method: event.request.method,
        headers: headers,
        mode: 'cors', // Luôn dùng 'cors'
        credentials: 'omit',
        cache: 'no-cache', // Không cache request mạng
        redirect: 'follow'
    });
    
    console.log('Final Referer:', headers.get('Referer'));
    
    // Fetch với request đã được modify
    event.respondWith(
        fetch(modifiedRequest)
            .then((response) => {
                console.log(`Fetch success: ${response.status} ${response.statusText}`);
                
                // Trả về response ngay lập tức
                return response;
            })
            .catch((error) => {
                console.error('--- SW FETCH ERROR ---');
                console.error('Error:', error);
                console.error('URL:', url);
                console.error('Lỗi có thể do CORS, thiếu Referer, hoặc lỗi mạng/SSL.');
                
                // Tối ưu hóa: Thay vì thử fetch lại không có headers (dễ thất bại),
                // chúng ta trả về một Response báo lỗi mạng/404 để Cast Receiver (Shaka Player) 
                // có thể bắt được lỗi và thông báo cho người dùng (Code 905).
                
                return new Response(
                    JSON.stringify({
                        error: 'Network or CORS issue preventing fetch. Custom headers failed.',
                        url: url
                    }), {
                        status: 503, // Service Unavailable, hoặc 404/403 nếu phù hợp hơn
                        statusText: 'Service Worker Fetch Failed (CORS/Referer Issue)',
                        headers: {'Content-Type': 'application/json'}
                    }
                );
            })
    );
});

// Message event - để nhận messages từ main thread
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

console.log('Service Worker loaded and ready');
