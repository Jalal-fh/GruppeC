const fs = require("fs");

function readBikeDataset(fileName) {
  try {
    const fileContent = fs.readFileSync(fileName, "utf8");
    const bikes = JSON.parse(fileContent);

    return bikes;
  } catch (error) {
    console.error("Fehler beim Einlesen der Datei:", error.message);
    return [];
  }
}

function displayBikes(bikes) {
  bikes.forEach((bike, index) => {
    console.log(`\nFahrrad ${index + 1}:`);
    console.log(bike);
  });
}

function displayAvailableBikes(bikes) {
  const availableBikes = bikes.filter(
    (bike) => bike.availability === "available"
  );

  console.log("\nFreie Fahrräder:");

  availableBikes.forEach((bike) => {
    console.log(
      `${bike.bikeId}: ${bike.model}, Farbe: ${bike.color}, ` +
      `Stundenpreis: ${bike.prices.hourly} Euro, ` +
      `Tagespreis: ${bike.prices.daily} Euro`
    );
  });
}

const bikes = readBikeDataset("bikes.json");

console.log("Alle Fahrräder als einzelne Objekte:");
displayBikes(bikes);

displayAvailableBikes(bikes);