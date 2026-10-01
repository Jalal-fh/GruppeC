# GruppeC
Gruppen Projekt

## nah. Dating-App

### Lokal starten

Im Projektordner ausführen:

```sh
python3 -m http.server 8000
```

Danach `http://localhost:8000` im Browser öffnen. Die App nutzt IndexedDB und Web Crypto; `localhost` ist dafür erforderlich. Es werden keine Pakete installiert.

### Funktionen

- Registrierung, Anmeldung und Demo-Modus
- Profil und Interessen bearbeiten; Alters- und Umkreissuche
- Vorschläge mit Interessen-Überschneidung, Likes, Favoriten und Demo-Matches
- Lokale Chats; Nachrichten registrierter Konten werden mit AES-GCM verschlüsselt und der Schlüssel aus dem Passwort abgeleitet
- Mikrofon- und Kameravorschau über Browser-Medienberechtigungen

### Prototyp-Grenzen

Profile und Demo-Matches sind Beispieldaten. Konten, Favoriten und Nachrichten werden nur im Browser dieses Geräts gespeichert; es gibt noch keinen gemeinsamen Server oder eine Synchronisierung zwischen Nutzern. Der Demo-Modus ist nicht für private Nachrichten gedacht. Die Anrufansicht zeigt nur die lokale Geräte-Vorschau: Für echte Sprach- und Videoanrufe zwischen Nutzern braucht es einen Signalisierungsserver und eine sichere Bereitstellung über HTTPS.
