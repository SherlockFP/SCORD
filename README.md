# SCORD

Discord benzeri sunucu ve kanal arayüzünü WebRTC bağlantılarıyla birleştiren deneysel sohbet uygulaması. Python/FastAPI sinyalleşme servisi ve derleme gerektirmeyen HTML/CSS/JavaScript istemcisinden oluşur.

## Çalıştırma

Python 3.10 veya üstü gerekir. Proje kökünde:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn server:app --host 127.0.0.1 --port 8000
```

Tarayıcıda `http://127.0.0.1:8000` adresini açın. Sistem Python'una bağımlılıklar kuruluysa `run.bat` da kullanılabilir. Giriş noktası kökteki **`server:app`**; `static/server.py` eski kopyadır. Sayfayı dosya olarak açmayın.

## Özellikler ve dosyalar

- `index.html`, `app.js`: kimlik, sunucular, metin/ses kanalları, mesajlaşma ve ayarlar.
- `static/p2p.js`: WebRTC bağlantıları, sinyalleşme, ses ve medya taşıması.
- `static/social.js`: onay gerektiren arkadaş istekleri; kabul, reddetme, iptal, arkadaşlıktan çıkarma, engelleme ve bekleyen işlemleri yeniden gönderme. Arkadaşlık verisi kimliğe göre tarayıcıda tutulur.
- `static/community.js`, `server.py`: sunucuda ortak anketler, oy değiştirme, anket kapatma, etkinlikler ve katılım. Oluşturma/yönetim işlemleri sahip, yönetici ve moderatör rolleriyle sınırlıdır.
- `static/design.css`, `static/design.js`: Varsayılan klasik tema ve isteğe bağlı Gece, Okyanus, Orman ve Gün Batımı temaları; görünüm yoğunluğu ve uyarlanabilir arayüz.
- `static/settings.js`: aranabilir profil, görünüm, ses/video, bildirim ve gizlilik ayarları.
- `static/chat-workspace.js`: mesaj araması/filtreleri, güvenli biçimlendirme ve üye araması. Kanal taslakları ayrı saklanır.
- `static/reliable-dm.js`: kimliğe özel kalıcı özel mesaj kuyruğu; alıcı cihazı alındı onayı, bekleme durumu, tekrar deneme/durdurma ve özel mesaj taslakları. Kuyruk doğrudan bağlantı kurulduğunda gönderilir; çevrimdışı sunucu teslimatı değildir.
- `static/ui-icons.js`, `static/ui-polish.css`, `static/workspace-polish.css`: 30 SVG ikon, temalı sürgüler/kaydırma çubukları ve azaltılmış hareket desteği.
- `static/profile-panel.js`: kullanıcı profilleri, ortak sunucular, özel notlar ve arkadaş işlemleri.
- `static/server-menus.js`: sunucu oluşturma/katılma, davet ve yönetim menüleri.
- `server.py`: oda keşfi, davetler, kanal/rol ayarları, WebSocket olayları ve JSON kalıcılığı.

Odalar ve topluluk verileri varsayılan olarak `rooms.json` içine yazılır. Farklı dosya için `SCORD_DATABASE_FILE` ortam değişkenini ayarlayın. Örnek sunucular yalnızca `SCORD_SEED_DEMO_ROOMS=true` olduğunda oluşturulur; bu ayar mevcut kayıtlı odaları silmez.

## Bağlantı ve güvenlik sınırları

SCORD tamamen sunucusuz değildir. WebRTC bağlantılarının kurulması için sinyalleşme servisi gerekir. Mesaj geçmişi ve bazı uygulama durumları sunucuda tutulur; doğrudan bağlantı kurulamadığında bazı mesajlar WebSocket üzerinden aktarılabilir. Bu nedenle tüm trafiğin yalnızca P2P veya uçtan uca şifreli olduğu varsayılmamalıdır.

Arkadaş istekleri bağlantı mevcut olduğunda iletilir; çevrimdışı işlemler yerel kuyrukta bekler. Kuyruğun yeniden gönderilmesi için gönderenin uygulamayı yeniden açması ve alıcıya bağlantı kurabilmesi gerekir. Merkezi, sürekli çalışan bir çevrimdışı teslimat hizmeti yoktur.

Kimlikler tarayıcıda saklanan istemci kimlikleridir; doğrulanmış hesap, parola, güvenilir kimlik doğrulama veya cihazlar arası hesap kurtarma sistemi yoktur. Rol kontrolleri bu kimliklere dayanır ve kötü niyetli kimlik taklidine karşı hesap güvenliği sağlamaz. Mevcut HTTP uçlarının tamamı güçlü yetkilendirmeyle korunmaz. Hassas veriler veya güvenilmeyen kullanıcılara açık üretim hizmeti için önce kimlik doğrulama, tüm uçlarda yetkilendirme, hız sınırı ve güvenlik incelemesi gerekir.

Mikrofon, kamera ve ekran paylaşımı tarayıcı izinlerine bağlıdır; localhost dışında HTTPS kullanın. NAT/güvenlik duvarı nedeniyle doğrudan WebRTC bağlantısı her ağda çalışmayabilir; TURN altyapısı ayrıca ele alınmalıdır. JSON depolama tek servis örneğine yöneliktir; çok işlemli veya yüksek trafikli kullanım için veritabanı gerekir.

## Testler

```powershell
.\.venv\Scripts\python -m pip install httpx
.\.venv\Scripts\python -m unittest discover -s tests -p "test_*.py" -v
node --test --test-isolation=none tests/*.test.cjs
```

Python testleri anket/etkinlik kurallarını, kalıcılığı, doğru giriş sayfası ve varlıkların sunulmasını, iki WebSocket istemcisi arasında oy eşitlemesini ve yetkisiz yönetim işlemlerinin reddini kapsar. Entegrasyon testleri gerçek oda dosyasına yazmaz. Node testleri arkadaşlık protokolünü ve çevrimdışı kuyruğu sınar. Bunlar gerçek iki cihaz arasında ses, kamera veya farklı NAT ağlarındaki bağlantı testlerinin yerine geçmez.

Yeni mesaj arşivi kimlik başına bu tarayıcıda en fazla 4000 kayıt tutar; kapasite veya depolama hatasında metin silinmez. Teslim edildi göstergesi alıcı cihazında kayıt anlamına gelir, okundu anlamına gelmez. Ayar yedeği yalnızca görünüm/ses/bildirim tercihlerini taşır; hesap, parola ve mesaj içermez.
