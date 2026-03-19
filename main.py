import pygame
import cv2
import numpy as np
import random
import os
import math
from hand_tracker import HandTracker
from game_objects import Fruit, Bomb, Particle, SliceTrail, DojoBackground

# --- Constants ---
WIDTH, HEIGHT = 1280, 720
FPS = 60 # Increased for smoother tracking and faster swipes
HS_FILE = "highscore.txt"

# --- Difficulty Configs ---
LEVEL_EASY = 0
LEVEL_MEDIUM = 1
LEVEL_HARD = 2

LEVEL_CONFIGS = {
    LEVEL_EASY: {"name": "EASY", "gravity": 0.35, "spawn_rate": 0.02, "vel_threshold": 45, "bomb_rate": 0.004},
    LEVEL_MEDIUM: {"name": "MEDIUM", "gravity": 0.5, "spawn_rate": 0.035, "vel_threshold": 65, "bomb_rate": 0.007},
    LEVEL_HARD: {"name": "HARD", "gravity": 0.65, "spawn_rate": 0.05, "vel_threshold": 85, "bomb_rate": 0.012}
}

# --- Initialization ---
pygame.init()
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Gesture Fruit Slicer - Difficulty Edition")
clock = pygame.time.Clock()

cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, WIDTH)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, HEIGHT)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 1) # Reduce lag

tracker = HandTracker(min_detection_confidence=0.4, min_tracking_confidence=0.4)
trail = SliceTrail(max_length=25) 
bg = DojoBackground(WIDTH, HEIGHT)

# --- Fonts ---
font_score = pygame.font.SysFont("Verdana", 42, bold=True)
font_hs = pygame.font.SysFont("Verdana", 32, bold=True)
font_msg = pygame.font.SysFont("Verdana", 82, bold=True)
font_small = pygame.font.SysFont("Verdana", 28, bold=True)

# --- Game State ---
STATE_MENU = 0
STATE_LEVEL_SELECT = 1
STATE_PLAYING = 2
STATE_GAMEOVER = 3
game_state = STATE_MENU

difficulty = LEVEL_MEDIUM
score = 0
high_score = 0
lives = 0 # Initialized in reset_game
MAX_LIVES = 5

fruits = []
bombs = []
particles = []

def load_high_score():
    global high_score
    try:
        if os.path.exists(HS_FILE):
            with open(HS_FILE, "r") as f:
                high_score = int(f.read())
    except:
        high_score = 0

def save_high_score():
    try:
        with open(HS_FILE, "w") as f:
            f.write(str(high_score))
    except:
        pass

load_high_score()

def reset_game():
    global score, lives, fruits, bombs, particles
    score = 0
    lives = MAX_LIVES
    fruits = []
    bombs = []
    particles = []
    trail.clear()

def spawn_entities():
    config = LEVEL_CONFIGS[difficulty]
    current_spawn_rate = float(config["spawn_rate"]) + (float(score) / 2000.0)
    if random.random() < current_spawn_rate:
        fruits.append(Fruit(WIDTH, HEIGHT, gravity=float(config["gravity"])))
    if random.random() < float(config["bomb_rate"]):
        bombs.append(Bomb(WIDTH, HEIGHT, gravity=float(config["gravity"]) * 0.8))

def check_collisions(points_history):
    global score, lives, game_state, high_score
    if not points_history or len(points_history) < 2:
        return 0
    
    config = LEVEL_CONFIGS[difficulty]
    # Check at most last 8 segments for efficiency and safety
    history_to_check = points_history[-8:]
    count = 0
    
    for i in range(len(history_to_check) - 1):
        p_prev = history_to_check[i]
        p_curr = history_to_check[i+1]
        
        dist = math.sqrt((float(p_curr[0]) - float(p_prev[0]))**2 + (float(p_curr[1]) - float(p_prev[1]))**2)
        # Use a more relaxed threshold for multi-segment path
        if dist < 8.0: continue 

        angle = math.atan2(float(p_curr[1]) - float(p_prev[1]), float(p_curr[0]) - float(p_prev[0]))
        
        # Check fruits
        for fruit in fruits:
            if not fruit.is_sliced:
                d = (float(p_curr[0]) - float(p_prev[0]), float(p_curr[1]) - float(p_prev[1]))
                f = (float(p_prev[0]) - float(fruit.x), float(p_prev[1]) - float(fruit.y))
                a = d[0]**2 + d[1]**2
                if a == 0: continue
                b = 2 * (f[0] * d[0] + f[1] * d[1])
                c = (f[0]**2 + f[1]**2) - (float(fruit.radius) + 45.0)**2 # Increased hit box
                discriminant = b**2 - 4*a*c
                if discriminant >= 0:
                    discriminant = math.sqrt(discriminant)
                    if max(0.0, (-b - discriminant) / (2 * a)) <= min(1.0, (-b + discriminant) / (2 * a)):
                        fruit.is_sliced = True
                        fruit.slice_angle = angle
                        score += 10
                        count += 1
                        if score > high_score:
                            high_score = score
                            save_high_score()
                        for _ in range(12):
                            particles.append(Particle(fruit.x, fruit.y, fruit.color))

        # Check bombs
        for bomb in list(bombs):
            d = (float(p_curr[0]) - float(p_prev[0]), float(p_curr[1]) - float(p_prev[1]))
            f = (float(p_prev[0]) - float(bomb.x), float(p_prev[1]) - float(bomb.y))
            a = d[0]**2 + d[1]**2
            if a == 0: continue
            b = 2 * (f[0] * d[0] + f[1] * d[1])
            c = (f[0]**2 + f[1]**2) - (float(bomb.radius) + 15.0)**2
            discriminant = b**2 - 4*a*c
            if discriminant >= 0:
                discriminant = math.sqrt(discriminant)
                if max(0.0, (-b - discriminant) / (2 * a)) <= min(1.0, (-b + discriminant) / (2 * a)):
                    lives -= 1
                    bombs.remove(bomb)
                    if lives <= 0:
                        game_state = STATE_GAMEOVER
    return count

def draw_hud():
    # Score
    shadow_score = font_score.render(f"SCORE: {score}", True, (0, 0, 0))
    score_surf = font_score.render(f"SCORE: {score}", True, (255, 255, 255))
    screen.blit(shadow_score, (24, 24))
    screen.blit(score_surf, (20, 20))
    
    # Level & High Score
    lvl_name = LEVEL_CONFIGS[difficulty]["name"]
    hs_label = font_hs.render(f"MODE: {lvl_name} | BEST: {high_score}", True, (255, 200, 50))
    screen.blit(hs_label, (20, 75))
    
    # Lives
    lives_label = font_score.render("❤" * lives, True, (255, 50, 50))
    screen.blit(lives_label, (WIDTH - lives_label.get_width() - 20, 20))

def main():
    global game_state, score, lives, fruits, bombs, particles, difficulty
    
    running = True
    prev_pos = None
    
    while running:
        success, img = cap.read()
        if not success: break
        
        img = cv2.flip(img, 1)
        img = cv2.resize(img, (WIDTH, HEIGHT))
        img = tracker.find_hands(img, draw=False)
        hand_data = tracker.get_hand_data(img)

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            if event.type == pygame.KEYDOWN:
                if game_state == STATE_MENU:
                    if event.key == pygame.K_SPACE:
                        game_state = STATE_LEVEL_SELECT
                elif game_state == STATE_LEVEL_SELECT:
                    if event.key == pygame.K_1:
                        difficulty = LEVEL_EASY
                        reset_game()
                        game_state = STATE_PLAYING
                    elif event.key == pygame.K_2:
                        difficulty = LEVEL_MEDIUM
                        reset_game()
                        game_state = STATE_PLAYING
                    elif event.key == pygame.K_3:
                        difficulty = LEVEL_HARD
                        reset_game()
                        game_state = STATE_PLAYING
                elif game_state == STATE_GAMEOVER:
                    if event.key == pygame.K_SPACE:
                        game_state = STATE_LEVEL_SELECT

        if game_state == STATE_PLAYING:
            spawn_entities()
            for fruit in list(fruits):
                fruit.update()
                if fruit.is_off_screen():
                    if not fruit.is_sliced: lives -= 1 
                    fruits.remove(fruit)
            for bomb in list(bombs):
                bomb.update()
                if bomb.is_off_screen(): bombs.remove(bomb)
            for p in list(particles):
                p.update()
                if p.life <= 0: particles.remove(p)
            
            if hand_data:
                pos, vel = hand_data[0]
                trail.add_point(0, pos)
                check_collisions(trail.hand_trails.get(0, []))
                # prev_pos not needed as history is in trail
            else:
                trail.clear(0)

            if lives <= 0:
                game_state = STATE_GAMEOVER

        # Rendering
        bg.draw(screen)
        
        if game_state == STATE_PLAYING:
            cam_surface = pygame.surfarray.make_surface(cv2.cvtColor(img, cv2.COLOR_BGR2RGB).swapaxes(0, 1))
            cam_surface.set_alpha(65) 
            screen.blit(cam_surface, (0, 0))
            for fruit in fruits: fruit.draw(screen)
            for bomb in bombs: bomb.draw(screen)
            for p in particles: p.draw(screen)
            trail.draw(screen)
            draw_hud()

        elif game_state == STATE_MENU:
            overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, 200))
            screen.blit(overlay, (0, 0))
            title = font_msg.render("DIFFICULTY SLICER", True, (255, 200, 50))
            start_msg = font_score.render("PRESS SPACE TO BEGIN", True, (255, 255, 255))
            screen.blit(title, (WIDTH // 2 - title.get_width() // 2, HEIGHT // 2 - 80))
            screen.blit(start_msg, (WIDTH // 2 - start_msg.get_width() // 2, HEIGHT // 2 + 40))
            if hand_data: trail.add_point(0, hand_data[0][0])
            trail.draw(screen)

        elif game_state == STATE_LEVEL_SELECT:
            overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, 220))
            screen.blit(overlay, (0, 0))
            sel_title = font_score.render("SELECT DIFFICULTY", True, (255, 255, 255))
            e_msg = font_small.render("[1] EASY - Slow & Chill", True, (100, 255, 100))
            m_msg = font_small.render("[2] MEDIUM - Normal Pace", True, (255, 255, 100))
            h_msg = font_small.render("[3] HARD - Fast & Intense", True, (255, 100, 100))
            screen.blit(sel_title, (WIDTH // 2 - sel_title.get_width() // 2, HEIGHT // 2 - 120))
            screen.blit(e_msg, (WIDTH // 2 - e_msg.get_width() // 2, HEIGHT // 2 - 20))
            screen.blit(m_msg, (WIDTH // 2 - m_msg.get_width() // 2, HEIGHT // 2 + 30))
            screen.blit(h_msg, (WIDTH // 2 - h_msg.get_width() // 2, HEIGHT // 2 + 80))

        elif game_state == STATE_GAMEOVER:
            overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
            overlay.fill((80, 0, 0, 210))
            screen.blit(overlay, (0, 0))
            go_msg = font_msg.render("GAME OVER", True, (255, 255, 255))
            final_score = font_score.render(f"SCORE: {score}", True, (255, 255, 50))
            restart_msg = font_small.render("PRESS SPACE TO RE-SELECT LEVEL", True, (255, 255, 255))
            screen.blit(go_msg, (WIDTH // 2 - go_msg.get_width() // 2, HEIGHT // 2 - 100))
            screen.blit(final_score, (WIDTH // 2 - final_score.get_width() // 2, HEIGHT // 2))
            screen.blit(restart_msg, (WIDTH // 2 - restart_msg.get_width() // 2, HEIGHT // 2 + 100))

        pygame.display.update()
        clock.tick(FPS)

    cap.release()
    pygame.quit()

if __name__ == "__main__":
    main()
