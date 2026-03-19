import cv2
import mediapipe as mp
import time
import numpy as np

class HandTracker:
    def __init__(self, static_image_mode=False, max_hands=1, model_complexity=1,
                 min_detection_confidence=0.4, min_tracking_confidence=0.4):
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(static_image_mode=static_image_mode,
                                         max_num_hands=max_hands,
                                         model_complexity=model_complexity,
                                         min_detection_confidence=min_detection_confidence,
                                         min_tracking_confidence=min_tracking_confidence)
        self.mp_draw = mp.solutions.drawing_utils
        self.results = None
        
        # State per hand: key is hand index
        self.prev_positions = {}
        self.smoothed_positions = {}
        self.alpha = 0.7  # Increased for faster response to swipes

    def find_hands(self, img, draw=True):
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        self.results = self.hands.process(img_rgb)
        
        if self.results and self.results.multi_hand_landmarks:
            for hand_lms in self.results.multi_hand_landmarks:
                if draw:
                    self.mp_draw.draw_landmarks(img, hand_lms, self.mp_hands.HAND_CONNECTIONS)
        return img

    def get_hand_data(self, img, landmark_idx=8):
        """Returns a list of (pos, vel) for each detected hand."""
        hand_data = []
        if self.results and self.results.multi_hand_landmarks:
            h, w, c = img.shape
            for i, hand_lms in enumerate(self.results.multi_hand_landmarks):
                # We need a stable identifier for hands, but MediaPipe hand list is just based on detection.
                # For 2 hands, we can just use the index for now.
                lm = hand_lms.landmark[landmark_idx]
                cx, cy = int(lm.x * w), int(lm.y * h)
                pos = np.array([cx, cy])
                
                # Per-hand smoothing
                if i not in self.smoothed_positions:
                    self.smoothed_positions[i] = pos
                else:
                    self.smoothed_positions[i] = self.alpha * pos + (1 - self.alpha) * self.smoothed_positions[i]
                
                # Per-hand velocity
                vel = 0
                if i in self.prev_positions:
                    dist = np.linalg.norm(self.smoothed_positions[i] - self.prev_positions[i])
                    vel = dist
                
                self.prev_positions[i] = self.smoothed_positions[i].copy()
                hand_data.append((self.smoothed_positions[i].astype(int), vel))
        
        # Cleanup stale hands if needed (optional for simple games)
        return hand_data

if __name__ == "__main__":
    cap = cv2.VideoCapture(0)
    tracker = HandTracker()
    while True:
        success, img = cap.read()
        if not success:
            break
        img = cv2.flip(img, 1)
        img = tracker.find_hands(img)
        hand_data = tracker.get_hand_data(img)
        for pos, vel in hand_data:
            cv2.circle(img, tuple(pos), 10, (0, 255, 0), cv2.FILLED)
            cv2.putText(img, f"Vel: {int(vel)}", (pos[0], pos[1]-20), cv2.FONT_HERSHEY_PLAIN, 2, (255, 0, 255), 2)
        
        cv2.imshow("Image", img)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
    cap.release()
    cv2.destroyAllWindows()
