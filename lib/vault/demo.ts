export const DEMO_VAULT_NAME = 'Demo Vault';

export const DEMO_FILES: Record<string, string> = {
  'Welcome.md': `# Welcome to Notekeep Town

This town is built from a folder tree. Every folder at the top level is a **region**, every folder inside it is a **house**, and every note is a piece of furniture you can walk up to and read.

Walk with the arrow keys or WASD. Press Space in front of a door or a piece of furniture.`,

  'Robotics/Arm Project/Plan.md': `# Arm Project Plan

A 4-DOF desktop robot arm driven by an ESP32 and four MG996R servos.

- [ ] Finish the shoulder bracket in CAD
- [ ] Print the base at 0.2 mm layer height
- [x] Order servos and a 6V 5A supply

See [[Servo Notes]] for the torque calculation.`,

  'Robotics/Arm Project/Servo Notes.md': `# Servo Notes

MG996R stall torque is about 11 kg·cm at 6 V. The forearm plus gripper masses roughly 180 g at a 14 cm reach, so the elbow sees about 2.5 kg·cm under load. That leaves plenty of margin.

Power the servos from a separate rail. Sharing the ESP32's 5 V rail caused brownouts every time two joints moved at once.`,

  'Robotics/Arm Project/Firmware/Inverse Kinematics.md': `# Inverse Kinematics

Planar 2-link IK for the shoulder and elbow, then a wrist compensation so the gripper stays level.

\`\`\`cpp
float c2 = (x*x + y*y - L1*L1 - L2*L2) / (2*L1*L2);
float theta2 = acos(c2);
\`\`\`

Solve for theta1 with atan2. Clamp c2 to [-1, 1] before acos or NaN propagates into the servo write.`,

  'Robotics/Arm Project/Firmware/Serial Protocol.md': `# Serial Protocol

One line per command, newline terminated.

| Command | Meaning |
|---|---|
| \`M 90 45 120 30\` | move all four joints, degrees |
| \`G 1\` | gripper close |
| \`H\` | home |

Baud 115200. The ESP32 echoes \`ok\` after each move completes.`,

  'Robotics/Line Follower/Sensor Array.md': `# Sensor Array

Five TCRT5000 reflectance sensors on a 12 mm pitch. Read them as analog, threshold at the midpoint between the white and black calibration values taken at boot.

The middle three sensors are all you need for a straight track. The outer pair only matters at sharp corners.`,

  'Robotics/Line Follower/PID Tuning.md': `# PID Tuning

Started with P only. Kp = 0.8 followed the line but oscillated hard.

- Kp 0.8, Kd 0 → oscillates
- Kp 0.6, Kd 0.15 → smooth on straights, cuts corners
- Kp 0.7, Kd 0.2, Ki 0.001 → best lap so far, 14.2 s

Ki barely matters on this track. Leave it small.`,

  'Robotics/Reading List.md': `# Robotics Reading List

- *Modern Robotics* by Lynch and Park, chapters 1 to 6
- *Probabilistic Robotics* by Thrun, for the localisation unit
- Peter Corke's Robotics Toolbox tutorials

Next up: the SLAM chapter.`,

  'Coursework/Calculus II/Series Convergence.md': `# Series Convergence

Order of tests to try:

1. Divergence test. If the terms do not go to zero, done.
2. Geometric or p-series if it looks like one.
3. Ratio test for factorials and exponentials.
4. Comparison or limit comparison for rational terms.
5. Alternating series test last.

The ratio test is inconclusive when the limit is exactly 1.`,

  'Coursework/Calculus II/Integration by Parts.md': `# Integration by Parts

Pick u by LIATE: Logarithmic, Inverse trig, Algebraic, Trig, Exponential. Whatever comes first in that list is u.

Tabular method saves time when u is a polynomial. Alternate signs down the column.`,

  'Coursework/Intro to CS/Recursion.md': `# Recursion

Every recursive function needs a base case and a step that moves toward it.

\`\`\`python
def fact(n):
    return 1 if n <= 1 else n * fact(n - 1)
\`\`\`

Python's default recursion limit is 1000. Use iteration for anything deeper than that.`,

  'Coursework/Intro to CS/Big O Cheatsheet.md': `# Big O Cheatsheet

- Array index: O(1)
- Binary search: O(log n)
- Linear scan: O(n)
- Merge sort: O(n log n)
- Nested loops over the same list: O(n²)

Hash map lookup is O(1) on average but O(n) in the worst case.`,

  'Coursework/Intro to CS/Labs/Lab 3 Notes.md': `# Lab 3 Notes

Implement a linked list with insert, delete and reverse. Reverse in place with three pointers: prev, curr, next.

Grader failed my first submission because delete on an empty list threw instead of returning None.`,

  'Coursework/Semester Schedule.md': `# Semester Schedule

Monday and Wednesday: Calculus II at 9, Intro to CS at 1.
Tuesday and Thursday: Writing seminar at 10, robotics club at 6.
Friday: open. Use it for the arm project.`,

  'Personal/Journal/2026-09-14.md': `# Sunday, 14 September

First week of Exploratory Studies done. The robotics club meeting was the highlight. Three people signed up for the arm project.

Need to sleep earlier. Two nights in a row past 2 am is not sustainable.`,

  'Personal/Journal/2026-09-18.md': `# Thursday, 18 September

Got the ESP32 talking to the servo driver. Watching the first joint move on command felt better than any grade this week.

Tomorrow: pick up the printed base from the makerspace.`,

  'Personal/Ideas/App Ideas.md': `# App Ideas

- A vault-to-town generator so notes feel like a place instead of a list
- A shared grocery list that clears itself when someone checks out
- A pomodoro timer that refuses to start if the phone is in the room

The first one is happening right now.`,

  'Personal/Ideas/Research Directions.md': `# Research Directions

Soft robotics for gripping fragile objects. Tendon-driven fingers with a compliant silicone skin.

Read the Harvard Wyss Institute papers on pneumatic actuators first. Ask about undergraduate research openings in the spring.`,

  'Personal/Recipes/Kimchi Fried Rice.md': `# Kimchi Fried Rice

Day-old rice, a cup of chopped kimchi, a spoon of gochujang, two eggs. Fry the kimchi first until it darkens, then the rice, then push everything aside and fry the eggs in the same pan.

Fifteen minutes, one pan.`,
};
