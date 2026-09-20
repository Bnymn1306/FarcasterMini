# Base Sepolia Test USDC Nasıl Alınır?

## Adım 1: Base Sepolia ETH Alın (Gas için)

Öncelikle işlem ücretleri için Base Sepolia ETH'ye ihtiyacınız var:

### Seçenek A: Coinbase Wallet Faucet
1. [Coinbase Wallet Faucet](https://www.coinbase.com/faucets/base-sepolia-faucet) adresine gidin
2. Wallet adresinizi girin
3. "Send me ETH" butonuna tıklayın
4. ~0.05 Base Sepolia ETH alacaksınız

### Seçenek B: Alchemy Faucet
1. [Alchemy Base Sepolia Faucet](https://www.alchemy.com/faucets/base-sepolia) adresine gidin
2. Alchemy hesabı oluşturun (ücretsiz)
3. Wallet adresinizi girin
4. Test ETH alın

## Adım 2: Base Sepolia USDC Alın

Base Sepolia USDC Contract: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

### Yöntem 1: Circle Faucet (Önerilen - En Kolay)
1. [Circle Testnet Faucet](https://faucet.circle.com/) adresine gidin
2. "Base Sepolia" seçin
3. Wallet adresinizi girin
4. "Request USDC" butonuna tıklayın
5. ~10 test USDC alacaksınız (ücretsiz)

### Yöntem 2: Uniswap'ta Swap (ETH varsa)
1. [Uniswap Base Sepolia](https://app.uniswap.org/) adresine gidin
2. Base Sepolia network'ü seçin
3. ETH → USDC swap yapın
4. USDC contract adresini ekleyin: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

### Yöntem 3: BaseScan'den Direct Mint (Test Contract)
1. [BaseScan Base Sepolia USDC Contract](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e#writeContract) adresine gidin
2. "Connect to Web3" butonuna tıklayın
3. "Write Contract" sekmesine gidin
4. Bazı test USDC kontratları `mint` fonksiyonu sağlar - deneyin

## Adım 3: Wallet'ınızda USDC'yi Görüntüleyin

MetaMask veya başka cüzdan kullanıyorsanız:

1. "Import Token" / "Add Token" seçeneğine tıklayın
2. Contract Address: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
3. Token Symbol: USDC
4. Decimals: 6
5. "Add" / "Import" butonuna tıklayın

## Premium Launch için Gereken Miktar

- **Premium Token Launch**: 0.05 USDC
- **Advanced Analytics**: 0.01 USDC  
- **Priority Prediction**: 0.01 USDC

Circle faucet'tan 10 USDC alırsanız, birçok premium launch yapabilirsiniz!

## Sorun Giderme

### "Insufficient USDC balance" Hatası
- Wallet'ınızda en az 0.05 USDC olduğundan emin olun
- Token'ın doğru import edildiğini kontrol edin
- Network'ün Base Sepolia olduğunu doğrulayın

### "Insufficient gas" Hatası
- Önce Adım 1'den Base Sepolia ETH alın
- Gas ücretleri için en az 0.001 ETH gerekir

### Payment İstek Gelmedi
- Wallet'ınızın bağlı olduğundan emin olun
- Browser console'da hata olup olmadığını kontrol edin
- Sayfayı yenileyin ve tekrar deneyin

## Hazırsınız! 🚀

Test USDC'niz hazır olduğunda:

1. BasedMem'de "Premium Launch" seçeneğini seçin
2. Token bilgilerini doldurun
3. "Premium Launch ($0.05 USDC)" butonuna tıklayın
4. Wallet'ınız ödeme onayı isteyecek
5. Onaylayın ve token'ınız verified badge ile oluşturulsun!
