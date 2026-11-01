document.addEventListener('DOMContentLoaded', function() {
            const menuToggle = document.getElementById('menuToggle');
            const sidebar = document.getElementById('sidebar');
            const toggleIcon = menuToggle.querySelector('i');

            menuToggle.addEventListener('click', function() {
                sidebar.classList.toggle('open');
                
                // Toggle hamburger icon between bars and close icon
                if (sidebar.classList.contains('open')) {
                    toggleIcon.classList.remove('fa-bars');
                    toggleIcon.classList.add('fa-xmark');
                } else {
                    toggleIcon.classList.remove('fa-xmark');
                    toggleIcon.classList.add('fa-bars');
                }
            });
        });