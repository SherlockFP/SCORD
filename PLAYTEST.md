# SCORD yerel playtest — 20 Eylül 2026

Testler ana oda dosyasından ayrı bir veritabanında, SCORD Kullanım Testi odasında yapıldı. Kullanıcının mevcut gg odası korunmuştur.

## Tarayıcıda doğrulananlar

- İki ayrı yerel kimlik (127.0.0.1 ve localhost): aynı sunucuya davetle katılma, gerçek doğrudan bağlantı, arkadaş isteğinin teslimi, karşı taraftan kabul ve iki tarafta arkadaşlık görünümü.
- Çift yönlü özel mesaj teslimatı; kanal mesajlarında Enter ile tek gönderim.
- Kalın ve kod biçimlendirme; HTML etiketlerinin çalıştırılmadan metin olarak görünmesi.
- Mesaj aramasından sonuca gitme; kanal değişiminde ayrı taslakların geri gelmesi.
- Profilde ortak sunucu, bağlantı durumu, özel not kaydı; kendi profilinden ayarlara geçiş.
- Ayarlarda boş ad doğrulaması, tercihlerin yeniden açılışta korunması, klasik/okyanus tema seçimi, ayar araması ve kaydetmeden çıkışta eski adın korunması.
- Sunucu oluşturma, davet bilgileri, üye araması ve rol sekmeleri; anket oluşturma ve oy değiştirme.
- 390 × 844 görünümde sohbet, ayarlar, üye çekmecesi ve profil. Görünmeyen mobil üye çekmecesi düzeltilip yeniden denendi.

## Otomatik kontroller

62 JavaScript ve 10 Python testi başarılı. Sosyal protokol yarış durumları, teslim onayı/tekrarları, engelleme, ayar kaydı geri alma, mesaj güvenliği, taslak izolasyonu, mikrofon/kulaklık durumu, profil yardımcıları, DM listesi tekrarları, topluluk izinleri ve iki WebSocket istemcisinde eşitleme kapsanıyor. Ana sayfanın yüklediği betiklerin sözdizimi ve yeni varlıkların HTTP üzerinden sunulması kontrol edildi.

## Kapsam sınırları

Farklı fiziksel cihazlar, gerçek mikrofon/kamera/ekran paylaşımı ve farklı NAT ağları denenmedi. İki yerel kimlikle başarı, internet üzerindeki her ağda başarı garantisi değildir. Eski uygulamanın bütün medya ve gelişmiş yönetim pencereleri bu turda baştan yazılmadı. Yüklenmeyen eski fixes_v2.js dosyasında mevcut sözdizimi sorunu var; aktif giriş sayfası bu dosyayı kullanmıyor. Gerçek hesap doğrulaması ve üretim güvenliği ayrıca ele alınmalı.

Genel prototip değerlendirmesi: **8/10**. Arayüz ve günlük sohbet akışları belirgin biçimde gelişti; kimlik güvenliği ve eski kodun bakım yükü puanı sınırlıyor.

## İkinci geliştirme ve tasarım turu

- Gerçek iki yerel kullanıcı: bağlantı yokken gönderilen DM bekledi, sayfa yenilenince korundu, ortak sunucuya tekrar bağlanınca bir kez alındı ve gönderen tarafında teslim onayı göründü.
- Kaydet düğmesi ve Kaydettiklerim filtresi: yalnızca seçilen mesaj döndü; arama fare ve klavyeden açıldı.
- Mikrofon sürgüsü ok tuşuyla 100% → 110% güncellendi; eski değere geri alınıp kaydedildi.
- Yeni geometrik profil masaüstünde ve 390 × 844 ekranda görsel olarak incelendi; merkezleme ve yinelenen mobil menü düzeltildi.
- Yeni ayar aktarımı için bozuk JSON yapısı, sürüm, gizli alan/kimlik, tür ve aralık doğrulamaları birim testlerinde kapsandı; dosya yükleme akışı tarayıcıda ayrıca denenmedi.
- Yeni SVG ikonlar harici görsel isteği üretmez. Mesaj yenilenmesindeki tekrar animasyonları kapatıldı, arşiv eşitlemesi tek geçişli indeks kullanır, değişmeyen depolama içeriği yeniden ayrıştırılmaz. FPS veya fiziksel cihaz performans kıyaslaması yapılmadı.
