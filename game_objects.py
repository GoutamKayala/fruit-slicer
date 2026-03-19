import pygame
import random
import math

class Fruit:
    def __init__(self, width, height, gravity=0.5):
        self.width = width
        self.height = height
        self.radius = 35
        self.color = (random.randint(150, 255), random.randint(50, 150), random.randint(50, 150))
        self.x = 0.0
        self.y = 0.0
        self.vel_x = 0.0
        self.vel_y = 0.0
        self.gravity = gravity
        self.is_sliced = False
        self.slice_angle = 0
        self.reset()

    def reset(self):
        self.x = random.randint(150, self.width - 150)
        self.y = self.height + 50
        self.vel_x = random.uniform(-4, 4)
        self.vel_y = random.uniform(-18, -25)
        self.is_sliced = False

    def update(self):
        self.x += self.vel_x
        self.y += self.vel_y
        self.vel_y += self.gravity

    def draw(self, screen):
        if not self.is_sliced:
            # Draw fruit with a slight shadow or border for arcade look
            pygame.draw.circle(screen, (0, 0, 0), (int(self.x), int(self.y)), self.radius + 2)
            pygame.draw.circle(screen, self.color, (int(self.x), int(self.y)), self.radius)
        else:
            # Draw two halves moving away based on slice angle
            offset = 15
            dx = math.cos(self.slice_angle) * offset
            dy = math.sin(self.slice_angle) * offset
            
            # Simple splitting visual
            pygame.draw.circle(screen, self.color, (int(self.x - dx), int(self.y - dy)), self.radius // 2)
            pygame.draw.circle(screen, self.color, (int(self.x + dx), int(self.y + dy)), self.radius // 2)

    def is_off_screen(self):
        return self.y > self.height + 100

class Bomb:
    def __init__(self, width, height, gravity=0.4):
        self.width = width
        self.height = height
        self.radius = 40
        self.color = (30, 30, 30)
        self.x = 0.0
        self.y = 0.0
        self.vel_x = 0.0
        self.vel_y = 0.0
        self.gravity = gravity
        self.reset()

    def reset(self):
        self.x = random.randint(150, self.width - 150)
        self.y = self.height + 50
        self.vel_x = random.uniform(-3, 3)
        self.vel_y = random.uniform(-16, -21)

    def update(self):
        self.x += self.vel_x
        self.y += self.vel_y
        self.vel_y += self.gravity

    def draw(self, screen):
        # Draw bomb with a white "shine"
        pygame.draw.circle(screen, (0, 0, 0), (int(self.x), int(self.y)), self.radius + 2)
        pygame.draw.circle(screen, self.color, (int(self.x), int(self.y)), self.radius)
        pygame.draw.circle(screen, (255, 0, 0), (int(self.x), int(self.y)), self.radius // 3)
        pygame.draw.circle(screen, (255, 255, 255), (int(self.x - 10), int(self.y - 10)), 5)

    def is_off_screen(self):
        return self.y > self.height + 100

class Particle:
    def __init__(self, x, y, color):
        self.x = x
        self.y = y
        self.color = color if len(color) == 3 else color[:3]
        self.vel_x = random.uniform(-8, 8)
        self.vel_y = random.uniform(-8, 8)
        self.life = 255
        self.decay = random.randint(8, 20)

    def update(self):
        self.x += self.vel_x
        self.y += self.vel_y
        self.life -= self.decay

    def draw(self, screen):
        if self.life > 0:
            s = pygame.Surface((12, 12), pygame.SRCALPHA)
            pygame.draw.circle(s, self.color + (self.life,), (6, 6), random.randint(3, 6))
            screen.blit(s, (self.x - 6, self.y - 6))

class SliceTrail:
    def __init__(self, max_length=12):
        self.hand_trails = {} # Key: hand_id, Value: list of points
        self.max_length = max_length

    def add_point(self, hand_id, point):
        if hand_id not in self.hand_trails:
            self.hand_trails[hand_id] = []
        self.hand_trails[hand_id].append(point)
        if len(self.hand_trails[hand_id]) > self.max_length:
            self.hand_trails[hand_id].pop(0)

    def draw(self, screen):
        w, h = screen.get_width(), screen.get_height()
        trail_surf = pygame.Surface((w, h), pygame.SRCALPHA)
        for points in self.hand_trails.values():
            if len(points) > 2:
                for i in range(len(points) - 1):
                    alpha = int(255 * (i / len(points)))
                    color = (255, 250, 200, alpha) # Golden arcade trail
                    pygame.draw.line(trail_surf, color, points[i], points[i+1], i + 2)
        screen.blit(trail_surf, (0, 0))

    def clear(self, hand_id=None):
        if hand_id is None:
            self.hand_trails = {}
        elif hand_id in self.hand_trails:
            self.hand_trails[hand_id] = []

class DojoBackground:
    def __init__(self, width, height):
        self.width = width
        self.height = height
        self.bg_color = (40, 30, 20) # Deep wood color
        self.line_color = (60, 50, 40)
        self.timer = 0.0

    def draw(self, screen):
        self.timer += 0.05
        screen.fill(self.bg_color)
        
        # Draw wooden wall panels
        panel_width = self.width // 10
        for i in range(11):
            x = i * panel_width
            pygame.draw.line(screen, self.line_color, (x, 0), (x, self.height), 2)
        
        # Subtle horizontal shadow overlay
        shadow = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
        for y in range(0, self.height, 100):
            # Slow breathing effect
            alpha = int(20 + 10 * math.sin(self.timer + y/100))
            pygame.draw.rect(shadow, (0, 0, 0, alpha), (0, y, self.width, 50))
        screen.blit(shadow, (0, 0))
