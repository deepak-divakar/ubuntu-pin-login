CC = gcc
CFLAGS = -fPIC -Wall -Wextra -O2
LDFLAGS = -shared -lpam -lcrypt
TARGET = pam_pin.so
SRC = pam_pin.c

all: $(TARGET)

$(TARGET): $(SRC)
	$(CC) $(CFLAGS) $(SRC) -o $(TARGET) $(LDFLAGS)

clean:
	rm -f $(TARGET)

ARCH := $(shell dpkg-architecture -qDEB_HOST_MULTIARCH 2>/dev/null || echo x86_64-linux-gnu)

install: $(TARGET)
	install -m 0644 $(TARGET) /lib/$(ARCH)/security/
