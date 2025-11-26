# Image definitions
APP_NAME = crm-mock-app
BUILDER_IMAGE = registry.access.redhat.com/ubi9/nodejs-20

.PHONY: all build run stop clean help local local-down local-nuke

# Default target
all: run

# Build the image using s2i
build:
	@echo "Building $(APP_NAME) with s2i..."
	s2i build . $(BUILDER_IMAGE) $(APP_NAME)

# Run both containers using docker-compose
run: build
	@echo "Starting services..."
	docker compose up

# Stop containers (alias for docker-compose down)
stop:
	@echo "Stopping services..."
	docker compose down

# Clean up all artifacts: stops containers, removes volumes, and deletes the built image
clean:
	@echo "Cleaning up artifacts..."
	docker compose down --volumes --remove-orphans
	-docker rmi $(APP_NAME):latest 2>/dev/null || true
	-docker rmi $(BUILDER_IMAGE) 2>/dev/null || true
	-docker rmi mongo:latest 2>/dev/null || true

# Run application locally with MongoDB container
local:
	@echo "Starting MongoDB container..."
	docker compose up -d mongodb
	@echo "Installing dependencies..."
	npm install
	@echo "Starting application..."
	MONGODB_URI="mongodb://root:root@localhost:27017/crm-mock?authSource=admin" npm run start

# Stop local application (leaves DB running)
local-down:
	@echo "Stopping application..."
	-pkill -f "node server.js"

# Remove DB container and clean npm artifacts
local-nuke:
	@echo "Nuking local environment..."
	-pkill -f "node server.js"
	docker compose stop mongodb
	docker compose rm -f mongodb
	rm -rf node_modules

# Show this help message
help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@echo "  all        Default target. Builds and runs the application."
	@echo "  build      Build the docker image using s2i."
	@echo "  run        Build the image and start services with docker-compose."
	@echo "  stop       Stop running services (docker-compose down)."
	@echo "  clean      Stop services, remove volumes, and delete the built image."
	@echo "  local      Run application locally with MongoDB container."
	@echo "  local-down Stop local application (leaves DB running)."
	@echo "  local-nuke Remove DB container and clean npm artifacts."
	@echo "  help       Show this help message."
