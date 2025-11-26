import { Game } from "./Game";
import { initializeAmmo } from "./Physics/Ammo";
import { MainMenu } from "./Interface/MainMenu";
import { MultiplayerManager } from "./Multiplayer/MultiplayerManager";

let gameStarted = false;

async function main() {
  await initializeAmmo();
  const game = Game.getInstance();
  await game.globalLoadingManager.loadAllMeshs();

  // Create main menu
  const mainMenu = new MainMenu();
  
  // Set up game start callback
  mainMenu.setOnStartGame(() => {
    if (!gameStarted) {
      gameStarted = true;
      game.onLoad();
      game.startUpdateLoop();
    }
  });
}

main();
