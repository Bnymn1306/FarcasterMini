# BasedMem GitHub'a Yükleme Rehberi

## 📋 Gereksinimler
- GitHub hesabı
- GitHub Personal Access Token (PAT)

---

## 🔑 Adım 1: GitHub Personal Access Token Oluştur

1. GitHub'da git: https://github.com/settings/tokens
2. **"Generate new token"** > **"Classic"** seç
3. Token ayarları:
   - **Note**: `BasedMem Replit Access`
   - **Expiration**: 90 days (veya No expiration)
   - **Scopes**: ✅ `repo` (Full control of private repositories)
4. **Generate token** tıkla
5. ⚠️ **Token'ı kopyala** (bir daha göremezsin!)

---

## 🏗️ Adım 2: GitHub Repository Oluştur

1. Git: https://github.com/new
2. Repository settings:
   - **Owner**: `coinacci`
   - **Repository name**: `BasedMem`
   - **Description**: `Meme coin launch platform on Base blockchain`
   - **Visibility**: Public veya Private
   - ❌ **Initialize this repository with**: HİÇBİRİNİ SEÇME
3. **Create repository** tıkla

GitHub sana boş repo kurulum komutlarını gösterecek. Şimdi bunları kullanacağız.

---

## 💻 Adım 3: Replit Shell'den Yükle

### 3.1 Git Remote Ekle

Replit Shell'i aç ve şu komutları çalıştır:

```bash
# Git repository başlat (zaten varsa atla)
git init

# Kullanıcı bilgilerini ayarla
git config user.name "coinacci"
git config user.email "your-email@example.com"

# GitHub remote ekle (TOKEN ve REPO_NAME'i değiştir)
git remote add origin https://YOUR_GITHUB_TOKEN@github.com/coinacci/BasedMem.git
```

**Örnek:**
```bash
git remote add origin https://ghp_abc123xyz456@github.com/coinacci/BasedMem.git
```

### 3.2 Dosyaları Stage Et

```bash
# Tüm dosyaları ekle
git add .

# .env ve secrets'ı ignore et (eğer .gitignore yoksa)
echo "node_modules/" >> .gitignore
echo ".env" >> .gitignore
echo "dist/" >> .gitignore
echo ".replit" >> .gitignore
echo "replit.nix" >> .gitignore

# Stage et
git add .
```

### 3.3 Commit Yap

```bash
git commit -m "Initial commit - BasedMem platform

- Meme coin launch platform on Base blockchain
- Farcaster Frame integration
- Bonding curve pricing
- Real ERC-20 token deployment
- Portfolio tracking and price alerts
- Daily check-in gamification"
```

### 3.4 GitHub'a Push Et

```bash
# Main branch'e push
git branch -M main
git push -u origin main
```

---

## ✅ Adım 4: Doğrula

1. GitHub repository'e git: https://github.com/coinacci/BasedMem
2. Tüm dosyaların yüklendiğini kontrol et
3. README.md'nin düzgün göründüğünü doğrula

---

## 🔒 Güvenlik Notları

⚠️ **Asla şunları commit etme:**
- `.env` dosyası
- Private keys (DEPLOYER_PRIVATE_KEY)
- Database credentials
- Session secrets

✅ **Bu dosyalar .gitignore'da olmalı:**
```
node_modules/
.env
dist/
.replit
replit.nix
*.log
```

---

## 🐛 Sorun Giderme

### Hata: "Repository not found"
- Token'ın `repo` scope'u olduğundan emin ol
- Repository isminin doğru olduğunu kontrol et

### Hata: "Permission denied"
- Token'ın geçerli olduğunu kontrol et
- Token'ı yeniden oluştur ve dene

### Hata: "Already exists"
- Mevcut origin'i sil: `git remote remove origin`
- Tekrar ekle

---

## 📝 Sonraki Güncellemeler İçin

Kod değişikliklerini GitHub'a göndermek için:

```bash
git add .
git commit -m "Update: açıklama"
git push
```

---

## 🎯 Alternatif: GitHub CLI

Eğer GitHub CLI kuruluysa:

```bash
# GitHub'da login
gh auth login

# Repo oluştur ve push et
gh repo create BasedMem --public --source=. --remote=origin --push
```

---

**Hazırladı:** BasedMem Team  
**Tarih:** 2025  
**Platform:** https://basedmem.replit.app
