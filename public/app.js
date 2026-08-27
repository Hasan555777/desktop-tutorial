const taskForm = document.getElementById('task-form');
const taskInput = document.getElementById('task-input');
const taskList = document.getElementById('task-list');

function getTasks() {
    return JSON.parse(localStorage.getItem('wt_tasks') || '[]');
}

function renderTasks() {
    taskList.innerHTML = '';
    const tasks = getTasks();
    if (tasks.length === 0) {
        taskList.innerHTML = '<li style="color: #64748b;">কোনো টাস্ক সেভ করা নেই!</li>';
        return;
    }
    tasks.forEach((task, index) => {
        const li = document.createElement('li');
        li.className = 'task-item';
        li.innerHTML = `<span>${task}</span><button class="delete-btn" onclick="deleteTask(${index})">মুছুন</button>`;
        taskList.appendChild(li);
    });
}

taskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = taskInput.value.trim();
    if (val) {
        const tasks = getTasks();
        tasks.push(val);
        localStorage.setItem('wt_tasks', JSON.stringify(tasks));
        taskInput.value = '';
        renderTasks();
    }
});

window.deleteTask = function(index) {
    const tasks = getTasks();
    tasks.splice(index, 1);
    localStorage.setItem('wt_tasks', JSON.stringify(tasks));
    renderTasks();
};

document.addEventListener('DOMContentLoaded', renderTasks);